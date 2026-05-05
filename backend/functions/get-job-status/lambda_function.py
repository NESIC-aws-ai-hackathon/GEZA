"""
get-job-status Lambda
非同期ジョブの処理状態を DynamoDB から取得して返す。
認証済みユーザーの jobId のみ参照可能（userId = JWT sub で制御）。
"""
import json
import os
import boto3
from shared.decorators import handle_errors
from shared.structured_logger import get_structured_logger

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))
_table = _dynamodb.Table(os.environ["TABLE_NAME"])


@handle_errors
def lambda_handler(event, context):
    logger = get_structured_logger(context.aws_request_id)

    # Cognito オーソライザーが付与した sub を取得（SECURITY-12）
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    user_id = claims.get("sub")
    if not user_id:
        logger.warning("Missing JWT sub in request context")
        return {
            "statusCode": 401,
            "headers": {"Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "")},
            "body": json.dumps({"error": "Unauthorized"}, ensure_ascii=False),
        }

    path_params = event.get("pathParameters") or {}
    job_id = path_params.get("jobId")
    if not job_id:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "")},
            "body": json.dumps({"error": "jobId is required"}, ensure_ascii=False),
        }

    logger.info("get-job-status", extra={"job_id": job_id})

    response = _table.get_item(
        Key={"pk": f"JOB#{user_id}", "sk": f"JOB#{job_id}"},
        ConsistentRead=True,
    )

    item = response.get("Item")
    if not item:
        return {
            "statusCode": 404,
            "headers": {"Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "")},
            "body": json.dumps({"error": "Job not found"}, ensure_ascii=False),
        }

    payload = {
        "jobId": job_id,
        "status": item.get("status", "UNKNOWN"),
    }
    if item.get("status") == "COMPLETED":
        payload["result"] = item.get("result")

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "")},
        "body": json.dumps(payload, ensure_ascii=False),
    }
