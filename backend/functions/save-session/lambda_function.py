"""
save-session Lambda
謝罪セッションデータを DynamoDB に保存・更新する。
- session_id なし → PutItem（新規）
- session_id あり → UpdateItem（apology_date 等の追加）
"""
import json
import os
import uuid
import traceback
from datetime import datetime, timezone
import boto3
from shared.decorators import handle_errors, success_response, ValidationError
from shared.input_validator import validate
from shared.structured_logger import get_structured_logger

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))

_SCHEMA_CREATE = {
    "incident_summary":  {"type": "str",  "required": True},
    "enriched_summary":  {"type": "str",  "required": False},
    "ai_degree":         {"type": "int",  "required": False},
    "user_degree":       {"type": "int",  "required": False},
    "opponent_profile":  {"type": "str",  "required": False, "no_html_escape": True},
    "apology_plan":      {"type": "str",  "required": False, "no_html_escape": True},
    "face_config":       {"type": "str",  "required": False, "no_html_escape": True},
    "assessment_result": {"type": "str",  "required": False, "no_html_escape": True},
}

_SCHEMA_UPDATE = {
    "session_id":        {"type": "str",  "required": True},
    "apology_date":      {"type": "str",  "required": False},
    "practice_count":    {"type": "int",  "required": False},
}

_TTL_SECONDS = 60 * 60 * 24 * 90  # 90日


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
    now_iso = datetime.now(timezone.utc).isoformat()
    table = _dynamodb.Table(os.environ["DYNAMODB_TABLE_NAME"])

    if "session_id" in body and "incident_summary" not in body:
        # --- UpdateItem（Step6: apology_date 追加 等） ---
        validated = validate(body, _SCHEMA_UPDATE)
        session_id = validated["session_id"]

        update_expr = "SET #ua = :ua"
        expr_names = {"#ua": "updated_at"}
        expr_values = {":ua": now_iso}

        if "apology_date" in validated:
            update_expr += ", #ad = :ad"
            expr_names["#ad"] = "apology_date"
            expr_values[":ad"] = validated["apology_date"]
        if "practice_count" in validated:
            update_expr += ", #pc = :pc"
            expr_names["#pc"] = "practice_count"
            expr_values[":pc"] = validated["practice_count"]

        try:
            table.update_item(
                Key={"pk": f"USER#{user_id}", "sk": f"SESSION#{session_id}"},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
            )
        except Exception as ddb_exc:
            logger.error("DynamoDB update_item failed", extra={
                "error_type": type(ddb_exc).__name__,
                "error_msg": str(ddb_exc),
                "update_expr": update_expr,
                "expr_names": str(expr_names),
                "expr_values_keys": list(expr_values.keys()),
                "traceback": traceback.format_exc()[-800:],
            })
            raise
        logger.info("Session updated", extra={"session_id": session_id})
        return success_response({"sessionId": session_id, "updated": True})

    # --- PutItem（Step5: 新規セッション作成） ---
    validated = validate(body, _SCHEMA_CREATE)
    session_id = str(uuid.uuid4())
    ttl = int(datetime.now(timezone.utc).timestamp()) + _TTL_SECONDS

    item = {
        "pk":               f"USER#{user_id}",
        "sk":               f"SESSION#{session_id}",
        "session_id":       session_id,
        "incident_summary": validated.get("incident_summary", ""),
        "enriched_summary": validated.get("enriched_summary", ""),
        "ai_degree":        validated.get("ai_degree", 0),
        "user_degree":      validated.get("user_degree", 0),
        "opponent_profile": validated.get("opponent_profile", ""),
        "apology_plan":     validated.get("apology_plan", ""),
        "face_config":      validated.get("face_config", ""),
        "assessment_result": validated.get("assessment_result", ""),
        "practice_count":   0,
        "created_at":       now_iso,
        "updated_at":       now_iso,
        "ttl":              ttl,
    }

    table.put_item(Item=item)
    logger.info("Session created", extra={"session_id": session_id})
    return success_response({"sessionId": session_id, "created": True})
