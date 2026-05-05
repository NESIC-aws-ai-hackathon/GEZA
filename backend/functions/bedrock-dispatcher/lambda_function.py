"""
bedrock-dispatcher Lambda
SQS キューから非同期ジョブを受け取り、Bedrock を呼び出して結果を DynamoDB に書き込む。
ReportBatchItemFailures で部分的な失敗を DLQ に送る。
"""
import json
import os
import boto3
from shared.bedrock_client import call as bedrock_call
from shared.prompt_loader import load as load_prompt
from shared.structured_logger import get_structured_logger

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-northeast-1"))
_table = _dynamodb.Table(os.environ["TABLE_NAME"])

# functionType → (prompt_name, model_profile) マッピング
_FUNCTION_MAP = {
    "generate-opponent":         ("generate_opponent", "premium"),
    "generate-story":            ("generate_story", "premium"),
    "generate-feedback":         ("generate_feedback", "premium"),
    "generate-prevention":       ("generate_prevention", "premium"),
    "generate-follow-mail":      ("generate_follow_mail", "premium"),
    "analyze-reply":             ("analyze_reply", "standard"),
    "diagnose-tendency":         ("diagnose_tendency", "standard"),
    "generate-guidance-feedback":("generate_guidance_feedback", "premium"),
    "generate-plan":             ("generate_plan", "premium"),
}


def _update_status(pk: str, sk: str, status: str, result=None):
    update_expr = "SET #s = :s"
    expr_names = {"#s": "status"}
    expr_values = {":s": status}
    if result is not None:
        update_expr += ", #r = :r"
        expr_names["#r"] = "result"
        expr_values[":r"] = result
    _table.update_item(
        Key={"pk": pk, "sk": sk},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )


def lambda_handler(event, context):
    logger = get_structured_logger(context.aws_request_id)
    item_failures = []

    for record in event.get("Records", []):
        message_id = record["messageId"]
        try:
            body = json.loads(record["body"])
            user_id = body["userId"]
            job_id = body["jobId"]
            function_type = body["functionType"]
            variables = body.get("variables", {})

            pk = f"JOB#{user_id}"
            sk = f"JOB#{job_id}"

            logger.info("Processing job", extra={"job_id": job_id, "function_type": function_type})

            if function_type not in _FUNCTION_MAP:
                logger.error("Unknown functionType", extra={"function_type": function_type})
                _update_status(pk, sk, "FAILED")
                continue

            prompt_name, model_profile = _FUNCTION_MAP[function_type]
            system_prompt = load_prompt(prompt_name, variables)

            messages = [{"role": "user", "content": variables.get("user_message", "")}]
            result_text = bedrock_call(model_profile, messages, system_prompt)

            _update_status(pk, sk, "COMPLETED", result=result_text)
            logger.info("Job completed", extra={"job_id": job_id})

        except Exception as exc:
            logger.error("Failed to process record", extra={"message_id": message_id, "error": str(exc)})
            item_failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": item_failures}
