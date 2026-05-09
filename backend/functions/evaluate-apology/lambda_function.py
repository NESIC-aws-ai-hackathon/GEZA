"""
evaluate-apology Lambda — U3 謝罪評価
Nova Lite (fast) を使って謝罪文を評価し、ボスの反応・感情スコアを返す。
"""
import json
import os
import re
from shared.decorators import handle_errors, success_response, ValidationError
from shared.input_validator import validate
from shared.bedrock_client import call as bedrock_call
from shared.prompt_loader import load as load_prompt
from shared.structured_logger import get_structured_logger


# NG ワード検知はプロンプト側に委譲するが、最低限のバリデーションを実施
_SCHEMA = {
    "apology_text":       {"type": "str",  "required": True},
    "opponent_profile":   {"type": "dict", "required": True},
    "conversation_history": {"type": "list", "required": False},
    "session_id":         {"type": "str",  "required": False},
}

_FALLBACK_RESPONSE = {
    "emotion_label": "confusion",
    "response_text": "少し考えさせてください…",
    "anger_level": None,
    "trust_level": None,
    "anger_delta": 0,
    "trust_delta": 0,
    "ng_words": [],
    "follow_up_question": None,
    "is_fallback": True,
}


@handle_errors
def lambda_handler(event, context):
    logger = get_structured_logger(getattr(context, "aws_request_id", "local"))
    body = json.loads(event.get("body") or "{}")
    validated = validate(body, _SCHEMA)

    apology_text = validated["apology_text"]
    opponent_profile = body.get("opponent_profile", {})
    conversation_history = body.get("conversation_history", [])
    session_id = validated.get("session_id", "")

    logger.info("evaluate-apology", extra={"session_id": session_id, "turn": len(conversation_history)})

    # 最新10ターンだけ渡す（トークン制御）
    recent_history = conversation_history[-10:] if len(conversation_history) > 10 else conversation_history

    opponent_profile_str = json.dumps(opponent_profile, ensure_ascii=False)
    history_str = json.dumps(recent_history, ensure_ascii=False)

    prompt_text = load_prompt("evaluate_apology", {
        "opponent_profile": opponent_profile_str,
        "apology_text": apology_text,
        "conversation_history": history_str,
    })

    messages = [{"role": "user", "content": [{"text": prompt_text}]}]
    raw = bedrock_call("fast", messages, max_tokens=2048)

    # JSON を抽出（コードブロックを除去）
    raw_stripped = raw.strip()
    if raw_stripped.startswith("```"):
        lines = raw_stripped.split("\n")
        raw_stripped = "\n".join(lines[1:-1]) if len(lines) > 2 else raw_stripped

    try:
        result = json.loads(raw_stripped)
    except json.JSONDecodeError:
        logger.warning("JSON parse failed, using fallback", extra={"raw": raw[:200]})
        # 不完全な JSON でも response_text が取得できていれば活用する
        fallback = dict(_FALLBACK_RESPONSE)
        fallback["anger_level"] = opponent_profile.get("anger_level", 50)
        fallback["trust_level"] = opponent_profile.get("trust_level", 30)

        m_text = re.search(r'"response_text"\s*:\s*"((?:[^"\\]|\\.)*)"', raw_stripped)
        if m_text:
            fallback["response_text"] = m_text.group(1).replace('\\"', '"').replace('\\n', '\n')
            fallback["is_fallback"] = False  # 実際のテキストが取得できたのでメーターを変えない

        m_anger = re.search(r'"anger_level"\s*:\s*(\d+)', raw_stripped)
        if m_anger:
            fallback["anger_level"] = int(m_anger.group(1))

        m_trust = re.search(r'"trust_level"\s*:\s*(\d+)', raw_stripped)
        if m_trust:
            fallback["trust_level"] = int(m_trust.group(1))

        m_emotion = re.search(r'"emotion_label"\s*:\s*"([^"]+)"', raw_stripped)
        if m_emotion:
            fallback["emotion_label"] = m_emotion.group(1)

        return success_response(fallback)

    return success_response(result)
