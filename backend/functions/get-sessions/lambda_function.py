"""
get-sessions Lambda
認証済みユーザーの謝罪セッション一覧を DynamoDB から取得して返す。
pk = USER#{user_id} / sk begins_with SESSION# でクエリ。
"""
import json
import os
import html
import boto3
from boto3.dynamodb.conditions import Key
from shared.decorators import handle_errors, success_response
from shared.structured_logger import get_structured_logger

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))
_table = _dynamodb.Table(os.environ["DYNAMODB_TABLE_NAME"])


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

    resp = _table.query(
        KeyConditionExpression=Key("pk").eq(f"USER#{user_id}") & Key("sk").begins_with("SESSION#"),
        ScanIndexForward=False,  # 降順（新しい順）
    )

    items = resp.get("Items", [])

    sessions = []
    for item in items:
        # opponent_profile / apology_plan は JSON 文字列として保存されている
        def _parse(raw, default):
            if not raw:
                return default
            try:
                # html.escape で保存された既存データを unescape してから parse
                unescaped = html.unescape(raw) if "&amp;" in raw or "&quot;" in raw or "&#" in raw else raw
                return json.loads(unescaped)
            except (json.JSONDecodeError, TypeError):
                return default

        sessions.append({
            "id":               item.get("session_id", ""),
            "createdAt":        item.get("created_at", ""),
            "updatedAt":        item.get("updated_at", ""),
            "incidentSummary":  item.get("incident_summary", ""),
            "enrichedSummary":  item.get("enriched_summary", ""),
            "opponentProfile":  _parse(item.get("opponent_profile"), {}),
            "apologyPlan":      _parse(item.get("apology_plan"), {}),
            "faceConfig":       _parse(item.get("face_config"), None),
            "assessmentResult": _parse(item.get("assessment_result"), None),
            "practiceCount":    int(item.get("practice_count", 0) or 0),
            "apologyDate":      item.get("apology_date", ""),
            "apologyStatus":    item.get("apology_status", "planned"),
            "mailThread":       _parse(item.get("mail_thread"), []),
        })

    logger.info("Sessions listed", extra={"count": len(sessions)})
    return success_response({"sessions": sessions})
