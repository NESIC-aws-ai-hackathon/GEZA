"""
generate-mail-reply Lambda
受信メールに対する返信案をAIで自動生成する。
メールスレッドのコンテキストと謝罪案件情報を踏まえて適切な返信を作成。
"""
import json
from shared.decorators import handle_errors, success_response
from shared.input_validator import validate
from shared.bedrock_client import call as bedrock_call
from shared.prompt_loader import load as load_prompt
from shared.structured_logger import get_structured_logger

_SCHEMA = {
    "received_mail":     {"type": "str",  "required": True},
    "incident_summary":  {"type": "str",  "required": True},
    "opponent_profile":  {"type": "dict", "required": False},
    "mail_thread":       {"type": "list", "required": False},
    "apology_status":    {"type": "str",  "required": False},
}


@handle_errors
def lambda_handler(event, context):
    logger = get_structured_logger(getattr(context, "aws_request_id", "local"))
    body = json.loads(event.get("body") or "{}")
    validated = validate(body, _SCHEMA)

    received_mail    = validated["received_mail"]
    incident_summary = validated.get("incident_summary", "")
    opponent_profile = validated.get("opponent_profile", {})
    mail_thread      = validated.get("mail_thread", [])
    apology_status   = validated.get("apology_status", "planned")

    logger.info("generate-mail-reply", extra={
        "thread_length": len(mail_thread),
        "apology_status": apology_status,
    })

    # メールスレッドを時系列テキストに変換
    thread_text = ""
    if mail_thread:
        for i, m in enumerate(mail_thread):
            direction = "【受信】" if m.get("type") == "received" else "【送信】"
            thread_text += f"{direction} ({m.get('timestamp', '')})\n"
            if m.get("subject"):
                thread_text += f"件名: {m['subject']}\n"
            thread_text += f"{m.get('content', '')}\n\n"
    else:
        thread_text = "(初回のメールやり取り)"

    profile_str = json.dumps(opponent_profile, ensure_ascii=False) if opponent_profile else "{}"

    prompt_text = load_prompt("generate_mail_reply", {
        "received_mail":    received_mail,
        "incident_summary": incident_summary,
        "opponent_profile": profile_str,
        "mail_thread":      thread_text,
        "apology_status":   apology_status,
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
        logger.warning("JSON parse failed", extra={"raw": raw[:200]})
        result = {
            "subject": "",
            "body": raw_stripped[:1000],
            "tone_advice": "AIの出力形式にエラーがありました。内容を確認してご利用ください。",
        }

    return success_response(result)
