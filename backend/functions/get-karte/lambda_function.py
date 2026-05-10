"""
get-karte Lambda — U4 謝罪カルテ一覧取得
ユーザーの DynamoDB セッション一覧を最新50件取得し、updated_at 降順で返す。
"""
import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from shared.decorators import handle_errors, success_response
from shared.structured_logger import get_structured_logger

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))


def _parse_json_field(raw):
    """JSON文字列フィールドをパース。失敗時は None。"""
    try:
        return json.loads(raw) if raw else None
    except Exception:
        return None


def _format_session(item):
    """DynamoDB Item → カルテ一覧用レスポンス形式に変換"""
    ai_degree = item.get("ai_degree", 0)
    try:
        ai_degree = int(ai_degree)
    except (TypeError, ValueError):
        ai_degree = 0

    return {
        "session_id":        item.get("session_id", ""),
        "incident_summary":  item.get("incident_summary", ""),
        "ai_degree":         ai_degree,
        "apology_status":    item.get("apology_status", "planned"),
        "practice_result":   _parse_json_field(item.get("practice_result")),
        "actual_result":     _parse_json_field(item.get("actual_result")),
        "opponent_profile":  _parse_json_field(item.get("opponent_profile")),
        "mail_thread":       _parse_json_field(item.get("mail_thread")),
        "created_at":        item.get("created_at", ""),
        "updated_at":        item.get("updated_at", ""),
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

    # updated_at 降順でソート（sk は UUID ランダム順のためアプリケーション層で実施）
    items_sorted = sorted(
        items,
        key=lambda x: x.get("updated_at", ""),
        reverse=True,
    )

    sessions = [_format_session(item) for item in items_sorted]

    logger.info("get-karte", extra={"user_id": user_id[:8] + "...", "count": len(sessions)})
    return success_response({"sessions": sessions})
