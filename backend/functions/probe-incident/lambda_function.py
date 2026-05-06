"""
probe-incident Lambda
深掘りチャットでやらかし事案の車もりを引き出す。
Haiku 4.5 同期呼び出し (standard / 512MB / 30s)。
"""
import json
import os
import re
from shared.decorators import handle_errors, success_response, ValidationError
from shared.input_validator import validate
from shared.bedrock_client import call as bedrock_call
from shared.prompt_loader import load as load_prompt
from shared.structured_logger import get_structured_logger

_SCHEMA = {
    "incident_summary":    {"type": "str",  "required": True},
    "conversation_history":{"type": "list", "required": False},
    "round":               {"type": "int",  "required": False},
}
_MAX_ANSWER_LEN = 500
_MAX_ROUNDS = 5


def _extract_json(text: str) -> dict:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1).strip()
    return json.loads(text)


def _build_messages(conversation_history: list) -> list:
    """会話履歴を Bedrock Converse API メッセージ形式に変換。"""
    messages = []
    for msg in conversation_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and isinstance(content, str):
            messages.append({"role": role, "content": [{"text": content}]})
    if messages:
        messages.append({"role": "user", "content": [{"text": "次のアクションを実行してください。"}]})
    else:
        messages.append({"role": "user", "content": [{"text": "最初の質問を生成してください。"}]})
    return messages


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

    incident_summary = validated.get("incident_summary", "")
    conversation_history = validated.get("conversation_history", [])
    current_round = validated.get("round", 1)

    # 回答内容の長さ検証
    for msg in conversation_history:
        if msg.get("role") == "user" and len(msg.get("content", "")) > _MAX_ANSWER_LEN:
            raise ValidationError(
                f"回答は{_MAX_ANSWER_LEN}字以内で入力してください"
            )

    # 会話履歴を文字列化
    history_text = ""
    for msg in conversation_history:
        role_label = "アシスタント" if msg.get("role") == "assistant" else "ユーザー"
        history_text += f"{role_label}: {msg.get('content', '')}\n"

    variables = {
        "incident_summary": incident_summary,
        "conversation_history": history_text.strip() or "（まだ会話なし）",
        "round": str(current_round),
    }

    system_prompt = load_prompt("probe_incident", variables)
    messages = _build_messages(conversation_history)

    logger.info("Calling Bedrock", extra={"model": "standard", "round": current_round})
    result_text = bedrock_call("standard", messages, system_prompt, max_tokens=512)

    try:
        result = _extract_json(result_text)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("JSON parse failed", extra={"error": str(exc)})
        raise ValueError("回答の解析に失敗しました") from exc

    return success_response(result)
