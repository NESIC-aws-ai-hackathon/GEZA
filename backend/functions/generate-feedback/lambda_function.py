"""
generate-feedback Lambda — U3 フィードバック生成
Claude Sonnet (premium) を使って会話全体を分析し、
問題点・改善謝罪文・総評を返す。
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
    "final_angry_score":    {"type": "int",  "required": True},
    "final_trust_score":    {"type": "int",  "required": True},
}


@handle_errors
def lambda_handler(event, context):
    logger = get_structured_logger(getattr(context, "aws_request_id", "local"))
    body = json.loads(event.get("body") or "{}")
    validated = validate(body, _SCHEMA)

    conversation_history = body.get("conversation_history", [])
    opponent_profile     = body.get("opponent_profile", {})
    final_angry_score    = validated["final_angry_score"]
    final_trust_score    = validated["final_trust_score"]

    logger.info("generate-feedback", extra={
        "turns": len(conversation_history),
        "final_angry": final_angry_score,
        "final_trust": final_trust_score,
    })

    history_str          = json.dumps(conversation_history, ensure_ascii=False)
    opponent_profile_str = json.dumps(opponent_profile, ensure_ascii=False)

    prompt_text = load_prompt("generate_feedback", {
        "conversation_history": history_str,
        "opponent_profile": opponent_profile_str,
        "final_angry_score": str(final_angry_score),
        "final_trust_score": str(final_trust_score),
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
        logger.warning("JSON parse failed in generate-feedback", extra={"raw": raw[:200]})
        result = {
            "problems": ["フィードバックの生成に失敗しました。もう一度お試しください。"],
            "improved_apology_text": "",
            "overall_comment": "",
        }

    return success_response(result)
