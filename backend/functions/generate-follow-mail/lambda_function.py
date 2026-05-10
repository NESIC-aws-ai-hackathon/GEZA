"""
generate-follow-mail Lambda — U4 フォローメール生成
Claude Sonnet (premium) を使って謝罪後のフォローメールを生成する。
"""
import json
from shared.decorators import handle_errors, success_response
from shared.input_validator import validate
from shared.bedrock_client import call as bedrock_call
from shared.prompt_loader import load as load_prompt
from shared.structured_logger import get_structured_logger

_SCHEMA = {
    "opponent_profile":       {"type": "dict", "required": True},
    "problems":               {"type": "list", "required": True},
    "improved_apology_text":  {"type": "str",  "required": False},
    "final_trust_score":      {"type": "int",  "required": True},
}


@handle_errors
def lambda_handler(event, context):
    logger = get_structured_logger(getattr(context, "aws_request_id", "local"))
    body = json.loads(event.get("body") or "{}")
    validated = validate(body, _SCHEMA)

    opponent_profile      = validated["opponent_profile"]
    problems              = validated["problems"]
    improved_apology_text = validated.get("improved_apology_text", "")
    final_trust_score     = validated["final_trust_score"]

    logger.info("generate-follow-mail", extra={
        "final_trust": final_trust_score,
        "problem_count": len(problems),
    })

    profile_str  = json.dumps(opponent_profile, ensure_ascii=False)
    problems_str = json.dumps(problems, ensure_ascii=False)

    prompt_text = load_prompt("generate_follow_mail", {
        "opponent_profile":      profile_str,
        "problems":              problems_str,
        "improved_apology_text": improved_apology_text,
        "final_trust_score":     str(final_trust_score),
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
        logger.warning("JSON parse failed in generate-follow-mail", extra={"raw": raw[:200]})
        result = {
            "subject": "フォローメールの生成に失敗しました。もう一度お試しください。",
            "body": "",
        }

    return success_response(result)
