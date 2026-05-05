"""
GEZA Bedrock クライアント
AWS Bedrock Converse API のラッパー。指数バックオフリトライ（RETRY-03）。
"""
import os
import time
import boto3
from botocore.exceptions import ClientError
from shared.decorators import BedrockThrottleError

MODEL_IDS = {
    "fast":     "amazon.nova-lite-v1:0",
    "standard": "anthropic.claude-haiku-4-5-v1:0",
    "premium":  "anthropic.claude-sonnet-4-5-v1:0",
}

RETRY_DELAYS = [1, 2, 4]

RETRYABLE_CODES = {"ThrottlingException", "ServiceUnavailableException", "TooManyRequestsException"}


def _get_client():
    region = os.environ.get("BEDROCK_REGION", "ap-northeast-1")
    return boto3.client("bedrock-runtime", region_name=region)


def call(model_profile: str, messages: list, system_prompt: str = "", max_tokens: int = 2048) -> str:
    """
    Bedrock Converse API を呼び出してテキストレスポンスを返す。

    Args:
        model_profile: "fast" | "standard" | "premium"
        messages: [{"role": "user", "content": [{"text": "..."}]}]
        system_prompt: システムプロンプト文字列
        max_tokens: 最大出力トークン数

    Returns:
        モデルの出力テキスト文字列

    Raises:
        BedrockThrottleError: リトライ上限後もスロットリングが解消しない場合
        ClientError: その他の AWS API エラー（即時送出）
    """
    model_id = MODEL_IDS.get(model_profile, MODEL_IDS["fast"])
    client = _get_client()

    kwargs = {
        "modelId": model_id,
        "messages": messages,
        "inferenceConfig": {"maxTokens": max_tokens},
    }
    if system_prompt:
        kwargs["system"] = [{"text": system_prompt}]

    last_exc = None
    for attempt, delay in enumerate(RETRY_DELAYS):
        try:
            response = client.converse(**kwargs)
            return response["output"]["message"]["content"][0]["text"]
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in RETRYABLE_CODES:
                last_exc = exc
                if attempt < len(RETRY_DELAYS) - 1:
                    time.sleep(delay)
                continue
            raise

    raise BedrockThrottleError(f"Bedrock throttled after {len(RETRY_DELAYS)} retries") from last_exc
