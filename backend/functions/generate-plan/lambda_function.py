"""
generate-plan Lambda (trigger)
SQS に非同期ジョブを登録し、jobId を即時返却する。
bedrock-dispatcher が実際の Sonnet 呼び出しを担当。
fast / 256MB / 10s。
"""
import json
import os
import uuid
import boto3
from shared.decorators import handle_errors, success_response
from shared.input_validator import validate
from shared.structured_logger import get_structured_logger

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))
_sqs = boto3.client("sqs", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))

_SCHEMA = {
    "incident_summary":  {"type": "str",  "required": True},
    "enriched_summary":  {"type": "str",  "required": False},
    "ai_degree":         {"type": "int",  "required": False},
    "stage_name":        {"type": "str",  "required": False},
    "opponent_type":     {"type": "str",  "required": False},
    "opponent_personality": {"type": "str", "required": False},
    "opponent_anger_level": {"type": "int", "required": False},
    "opponent_ng_words": {"type": "str",  "required": False},
    "opponent_anger_points": {"type": "str", "required": False},
    "session_id":        {"type": "str",  "required": False},
}


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

    job_id = str(uuid.uuid4())
    table = _dynamodb.Table(os.environ["DYNAMODB_TABLE_NAME"])

    table.put_item(Item={
        "pk": f"JOB#{user_id}",
        "sk": f"JOB#{job_id}",
        "status": "PENDING",
        "job_id": job_id,
    })

    sqs_payload = {
        "userId":       user_id,
        "jobId":        job_id,
        "functionType": "generate-plan",
        "variables": {
            "incident_summary":     validated.get("incident_summary", ""),
            "enriched_summary":     validated.get("enriched_summary", "（詳細情報なし）"),
            "ai_degree":            str(validated.get("ai_degree", 0)),
            "stage_name":           validated.get("stage_name", "不明"),
            "opponent_type":        validated.get("opponent_type", "不明"),
            "opponent_personality": validated.get("opponent_personality", "不明"),
            "opponent_anger_level": str(validated.get("opponent_anger_level", 0)),
            "opponent_ng_words":    validated.get("opponent_ng_words", "なし"),
            "opponent_anger_points":validated.get("opponent_anger_points", "なし"),
            "user_message":         "謝罪プランを生成してください。",
        },
    }

    _sqs.send_message(
        QueueUrl=os.environ["SQS_QUEUE_URL"],
        MessageBody=json.dumps(sqs_payload, ensure_ascii=False),
    )

    logger.info("Job enqueued", extra={"job_id": job_id, "user_id": user_id})
    return success_response({"jobId": job_id, "status": "PENDING"})
