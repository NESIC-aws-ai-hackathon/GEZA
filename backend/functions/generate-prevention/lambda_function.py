"""
generate-prevention Lambda — U4 再発防止策・チェックリスト生成
Claude Sonnet (premium) を使って会話履歴・問題点から
再発防止策ステップ・AI追加チェックリスト項目・サマリーを返す。
"""
import json
from shared.decorators import handle_errors, success_response
from shared.input_validator import validate
from shared.bedrock_client import call as bedrock_call
from shared.prompt_loader import load as load_prompt
from shared.structured_logger import get_structured_logger

_SCHEMA = {
    "conversation_history": {"type": "list", "required": True},
    "opponent_profile":     {"type": "dict", "required": True},
    "problems":             {"type": "list", "required": True},
    "final_trust_score":    {"type": "int",  "required": True},
}


@handle_errors
def lambda_handler(event, context):
    logger = get_structured_logger(getattr(context, "aws_request_id", "local"))
    body = json.loads(event.get("body") or "{}")
    validated = validate(body, _SCHEMA)

    conversation_history = validated["conversation_history"]
    opponent_profile     = validated["opponent_profile"]
    problems             = validated["problems"]
    final_trust_score    = validated["final_trust_score"]

    logger.info("generate-prevention", extra={
        "turns": len(conversation_history),
        "problem_count": len(problems),
        "final_trust": final_trust_score,
    })

    history_str      = json.dumps(conversation_history, ensure_ascii=False)
    profile_str      = json.dumps(opponent_profile, ensure_ascii=False)
    problems_str     = json.dumps(problems, ensure_ascii=False)

    prompt_text = load_prompt("generate_prevention", {
        "conversation_history": history_str,
        "opponent_profile":     profile_str,
        "problems":             problems_str,
        "final_trust_score":    str(final_trust_score),
    })

    messages = [{"role": "user", "content": [{"text": prompt_text}]}]
    raw = bedrock_call("premium", messages, max_tokens=2048)

    raw_stripped = raw.strip()
    if raw_stripped.startswith("```"):
        lines = raw_stripped.split("\n")
        raw_stripped = "\n".join(lines[1:-1]) if len(lines) > 2 else raw_stripped

    try:
        result = json.loads(raw_stripped)
    except json.JSONDecodeError:
        logger.warning("JSON parse failed in generate-prevention", extra={"raw": raw[:200]})
        result = {
            "checklist_ai": [],
            "prevention_steps": [
                {"step": "1", "detail": "再発防止策の生成に失敗しました。もう一度お試しください。"}
            ],
            "summary": "生成に失敗しました。",
        }

    return success_response(result)
