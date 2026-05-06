"""
generate-opponent Lambda
やらかし事案とアセスメント結果から謝罪相手プロフィールを生成する。
Haiku 4.5 同期呼び出し (standard / 512MB / 30s)。
"""
import json
import os
import re
from shared.decorators import handle_errors, success_response
from shared.input_validator import validate
from shared.bedrock_client import call as bedrock_call
from shared.prompt_loader import load as load_prompt
from shared.structured_logger import get_structured_logger

_SCHEMA = {
    "incident_summary":  {"type": "str",  "required": True},
    "enriched_summary":  {"type": "str",  "required": False},
    "ai_degree":         {"type": "int",  "required": False},
    "stage_name":        {"type": "str",  "required": False},
    "relationship":      {"type": "str",  "required": False},
    "opponent_gender":   {"type": "str",  "required": False},
    "opponent_race":     {"type": "str",  "required": False},
    "opponent_tone":     {"type": "str",  "required": False},
    "opponent_outfit":   {"type": "str",  "required": False},
}


def _extract_json(text: str) -> dict:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1).strip()
    return json.loads(text)


@handle_errors
def lambda_handler(event, context):
    logger = get_structured_logger(context.aws_request_id)

    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )
    user_id = claims.get("sub")
    if not user_id:
        return {
            "statusCode": 401,
            "headers": {"Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "")},
            "body": json.dumps({"error": "Unauthorized"}, ensure_ascii=False),
        }

    body = json.loads(event.get("body") or "{}")
    validated = validate(body, _SCHEMA)

    variables = {
        "incident_summary": validated.get("incident_summary", ""),
        "enriched_summary": validated.get("enriched_summary", "（詳細情報なし）"),
        "ai_degree":        str(validated.get("ai_degree", 0)),
        "stage_name":       validated.get("stage_name", "不明"),
        "relationship":     validated.get("relationship", "不明"),
        "opponent_gender":  validated.get("opponent_gender", ""),
        "opponent_race":    validated.get("opponent_race", ""),
        "opponent_tone":    validated.get("opponent_tone", ""),
        "opponent_outfit":  validated.get("opponent_outfit", ""),
    }

    system_prompt = load_prompt("generate_opponent", variables)
    messages = [{
        "role": "user",
        "content": [{"text": "謝罪相手キャラクターを生成してください。"}],
    }]

    logger.info("Calling Bedrock", extra={"model": "standard", "user_id": user_id})
    result_text = bedrock_call("standard", messages, system_prompt, max_tokens=1024)

    try:
        result = _extract_json(result_text)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("JSON parse failed", extra={"error": str(exc)})
        raise ValueError("相手プロフィールの解析に失敗しました") from exc

    return success_response(result)
