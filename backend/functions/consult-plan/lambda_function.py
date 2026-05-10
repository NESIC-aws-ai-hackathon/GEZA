"""
consult-plan Lambda
謝罪プラン生成後にユーザーが現在の状況を相談し、AIがアドバイスと任意のプラン修正を返す。
同期呼び出し（standard / 256MB / 30s）。
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
    "incident_summary":     {"type": "str",  "required": True},
    "opponent_type":        {"type": "str",  "required": False},
    "opponent_anger_level": {"type": "int",  "required": False},
    "current_plan_summary": {"type": "str",  "required": False},
    "current_todo_list":    {"type": "str",  "required": False},
    "mail_thread_summary":  {"type": "str",  "required": False},
    "conversation_history": {"type": "list", "required": False},
    "user_message":         {"type": "str",  "required": True},
    "session_id":           {"type": "str",  "required": False},
}

MAX_HISTORY_TURNS = 10


def _extract_json(text: str) -> dict:
    """LLM出力からJSONを抽出。マークダウンコードブロックにも対応。"""
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

    # 会話履歴の長さ制限
    history = validated.get("conversation_history", [])
    if len(history) > MAX_HISTORY_TURNS * 2:
        raise ValidationError(f"会話履歴は最大{MAX_HISTORY_TURNS}ターンまでです")

    # 会話履歴を安全な形式に変換（role/contentのみ）
    safe_history = []
    for entry in history:
        if isinstance(entry, dict) and entry.get("role") in ("user", "assistant"):
            safe_history.append({
                "role": entry["role"],
                "content": str(entry.get("content", ""))[:1000],
            })

    variables = {
        "incident_summary":     validated.get("incident_summary", ""),
        "opponent_type":        validated.get("opponent_type", "不明"),
        "opponent_anger_level": str(validated.get("opponent_anger_level", 50)),
        "current_plan_summary": validated.get("current_plan_summary", "(プランなし)"),
        "current_todo_list":    validated.get("current_todo_list", "(TODOなし)"),
        "mail_thread_summary":  validated.get("mail_thread_summary", "(メールやり取りなし)"),
        "user_message":         validated.get("user_message", ""),
    }

    system_prompt = load_prompt("consult_plan", variables)

    # 会話履歴をBedrockメッセージ形式に変換
    messages = [
        {"role": h["role"], "content": [{"text": h["content"]}]}
        for h in safe_history
    ]
    messages.append({
        "role": "user",
        "content": [{"text": validated["user_message"]}],
    })

    result_text = bedrock_call("standard", messages, system_prompt)

    try:
        result = _extract_json(result_text)
    except (json.JSONDecodeError, ValueError):
        # JSONパース失敗時はテキストそのままをadviceとして返す
        result = {"advice": result_text.strip(), "revised_plan": None}

    # 必須フィールド保証
    if "advice" not in result:
        result["advice"] = result_text.strip()
    if "revised_plan" not in result:
        result["revised_plan"] = None

    logger.info("Consult completed", extra={"user_id": user_id, "turns": len(safe_history) + 1})
    return success_response(result)
