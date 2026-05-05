"""
GEZA プロンプトローダー
S3 上のプロンプトテンプレート（{{variable}} 形式）を読み込んで変数展開する。
"""
import re
import boto3
import os


class PromptNotFoundError(Exception):
    pass


class PromptRenderError(Exception):
    pass


def load(name: str, variables: dict = None) -> str:
    """
    S3 からプロンプトテンプレートを読み込んで変数展開した文字列を返す。

    Args:
        name: テンプレート名（拡張子なし）。例: "assess-apology"
        variables: {"variable_name": "value"} 形式の置換辞書

    Returns:
        展開済みプロンプト文字列

    Raises:
        PromptNotFoundError: テンプレートが S3 に存在しない場合
        PromptRenderError: 未定義変数が残存する場合
    """
    if variables is None:
        variables = {}

    bucket = os.environ.get("PROMPTS_BUCKET_NAME", "")
    key = f"{name}.txt"

    s3 = boto3.client("s3")
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        template = obj["Body"].read().decode("utf-8")
    except s3.exceptions.NoSuchKey:
        raise PromptNotFoundError(f"{key} が見つかりません")
    except Exception as exc:
        raise PromptNotFoundError(f"プロンプトの読み込みに失敗しました: {exc}") from exc

    for var_name, value in variables.items():
        template = template.replace("{{" + var_name + "}}", str(value))

    remaining = re.findall(r"\{\{(\w+)\}\}", template)
    if remaining:
        raise PromptRenderError(f"変数 '{remaining[0]}' が未定義です")

    return template
