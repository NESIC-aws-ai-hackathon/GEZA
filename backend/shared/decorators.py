"""
GEZA Lambda デコレーター
全 Lambda ハンドラーに @handle_errors を適用して統一エラーレスポンスを返す。
"""
import json
import os
import functools
from shared.structured_logger import get_structured_logger


class ValidationError(Exception):
    pass


class BedrockThrottleError(Exception):
    pass


def _build_response(status_code: int, body: dict) -> dict:
    allowed_origin = os.environ.get("ALLOWED_ORIGIN", "")
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": allowed_origin,
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


def handle_errors(func):
    @functools.wraps(func)
    def wrapper(event, context):
        request_id = getattr(context, "aws_request_id", "local")
        logger = get_structured_logger(request_id)
        try:
            logger.info("Lambda invoked", extra={"function": func.__name__})
            result = func(event, context)
            logger.info("Lambda succeeded")
            return result
        except ValidationError as exc:
            logger.warning("Validation failed", extra={"error_type": "ValidationError", "detail": str(exc)})
            return _build_response(400, {"error": str(exc), "request_id": request_id})
        except BedrockThrottleError:
            logger.error("Bedrock throttled after retries")
            return _build_response(503, {"error": "一時的に混雑しています。しばらくしてから再試行してください", "request_id": request_id})
        except Exception as exc:
            logger.error("Unexpected error", extra={"error_type": type(exc).__name__, "error_msg": str(exc)[:500]})
            return _build_response(500, {"error": "サーバーエラーが発生しました", "request_id": request_id})
    return wrapper


def success_response(body: dict) -> dict:
    return _build_response(200, body)


def not_found_response(request_id: str) -> dict:
    return _build_response(404, {"error": "リソースが見つかりません", "request_id": request_id})
