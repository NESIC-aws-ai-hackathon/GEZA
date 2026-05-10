"""
analyze-karte Lambda — U4 謝罪傾向分析
DynamoDB からセッションを取得し、Nova Lite で傾向コメントを生成する。
セッション数 < 2 の場合は Bedrock を呼び出さず固定メッセージを返す。
"""
import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from shared.decorators import handle_errors, success_response
from shared.bedrock_client import call as bedrock_call
from shared.prompt_loader import load as load_prompt
from shared.structured_logger import get_structured_logger

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))

_FIXED_MESSAGE_FEW = {
    "trend_comment": "謝罪カルテが2件以上蓄積されると、傾向分析が利用できます。",
    "weak_points": [],
    "strong_points": [],
    "advice": "まず実際の謝罪結果を記録して、カルテを積み上げましょう。",
}


@handle_errors
def lambda_handler(event, context):
    logger = get_structured_logger(getattr(context, "aws_request_id", "local"))

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

    table = _dynamodb.Table(os.environ["DYNAMODB_TABLE_NAME"])

    response = table.query(
        KeyConditionExpression=(
            Key("pk").eq(f"USER#{user_id}") & Key("sk").begins_with("SESSION#")
        ),
        ScanIndexForward=False,
        Limit=50,
    )
    items = response.get("Items", [])

    if len(items) < 2:
        logger.info("analyze-karte: too few sessions", extra={"count": len(items)})
        return success_response(_FIXED_MESSAGE_FEW)

    # 分析用に概要情報のみ抽出（個人情報を最小限に）
    summaries = []
    for item in items:
        ai_deg = item.get("ai_degree", 0)
        try:
            ai_deg = int(ai_deg)
        except (TypeError, ValueError):
            ai_deg = 0

        pr_raw = item.get("practice_result")
        final_trust = None
        if pr_raw:
            try:
                pr = json.loads(pr_raw)
                final_trust = pr.get("final_trust")
            except Exception:
                pass

        summaries.append({
            "ai_degree":      ai_deg,
            "apology_status": item.get("apology_status", "planned"),
            "final_trust":    final_trust,
            "updated_at":     item.get("updated_at", ""),
        })

    summaries_str = json.dumps(summaries, ensure_ascii=False)

    prompt_text = load_prompt("analyze_karte", {
        "session_count": str(len(summaries)),
        "sessions":      summaries_str,
    })

    messages = [{"role": "user", "content": [{"text": prompt_text}]}]
    raw = bedrock_call("fast", messages, max_tokens=512)

    raw_stripped = raw.strip()
    if raw_stripped.startswith("```"):
        lines = raw_stripped.split("\n")
        raw_stripped = "\n".join(lines[1:-1]) if len(lines) > 2 else raw_stripped

    try:
        result = json.loads(raw_stripped)
    except json.JSONDecodeError:
        logger.warning("JSON parse failed in analyze-karte", extra={"raw": raw[:200]})
        result = _FIXED_MESSAGE_FEW

    logger.info("analyze-karte", extra={"session_count": len(items)})
    return success_response(result)
