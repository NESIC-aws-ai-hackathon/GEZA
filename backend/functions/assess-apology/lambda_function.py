"""
assess-apology Lambda
やらかし事案を Nova Lite で分析し、謝罪角度 (0°～180°) を返却する。
同期呼び出し (fast / 256MB / 10s)。
"""
import json
import os
import re
import boto3
from shared.decorators import handle_errors, success_response, ValidationError
from shared.input_validator import validate
from shared.bedrock_client import call as bedrock_call
from shared.prompt_loader import load as load_prompt
from shared.structured_logger import get_structured_logger

_SCHEMA = {
    "incident_summary": {"type": "str", "required": True},
    "categories":       {"type": "str", "required": False},
    "relationship":     {"type": "str", "required": False},
    "deadline":         {"type": "str", "required": False},
    "affected_count":   {"type": "int", "required": False},
    "past_incidents":   {"type": "bool", "required": False},
}


def _extract_json(text: str) -> dict:
    """LLM出力から JSON を抽出する。マークダウンコードブロックも対応。"""
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
        logger.warning("Missing JWT sub")
        return {
            "statusCode": 401,
            "headers": {"Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "")},
            "body": json.dumps({"error": "Unauthorized"}, ensure_ascii=False),
        }

    body = json.loads(event.get("body") or "{}")
    validated = validate(body, _SCHEMA)

    variables = {
        "incident_summary": validated.get("incident_summary", ""),
        "categories":       validated.get("categories", "不明"),
        "relationship":     validated.get("relationship", "不明"),
        "affected_count":   str(validated.get("affected_count", "不明")),
        "deadline":         validated.get("deadline", "未設定"),
        "past_incidents":   "あり" if validated.get("past_incidents") else "なし",
    }

    system_prompt = load_prompt("assess_apology", variables)
    messages = [{
        "role": "user",
        "content": [{"text": "やらかし事案の謝罪角度を評価してください。"}],
    }]

    logger.info("Calling Bedrock", extra={"model": "fast", "user_id": user_id})
    result_text = bedrock_call("fast", messages, system_prompt, max_tokens=1024)

    try:
        result = _extract_json(result_text)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("JSON parse failed", extra={"error": str(exc), "raw": result_text[:200]})
        raise ValueError("評価結果の解析に失敗しました") from exc

    return success_response(result)
