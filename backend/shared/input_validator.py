"""
GEZA 入力バリデーション
全 Lambda のシステム境界で呼び出す。SECURITY-05 / XSS-01 準拠。
"""
import re
import html
from shared.decorators import ValidationError

MAX_STRING_LENGTH = 2000

INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(previous|all|above|prior)\s+instructions?", re.IGNORECASE),
    re.compile(r"system\s*:", re.IGNORECASE),
    re.compile(r"<\s*/?system\s*>", re.IGNORECASE),
    re.compile(r"you\s+are\s+now", re.IGNORECASE),
    re.compile(r"forget\s+(everything|all)", re.IGNORECASE),
    re.compile(r"new\s+instructions?\s*:", re.IGNORECASE),
    re.compile(r"act\s+as\s+(if\s+you\s+are|a\s+)", re.IGNORECASE),
    re.compile(r"jailbreak", re.IGNORECASE),
    re.compile(r"DAN\s+mode", re.IGNORECASE),
    re.compile(r"pretend\s+you", re.IGNORECASE),
]

TYPE_MAP = {
    "str": str,
    "int": int,
    "list": list,
    "dict": dict,
    "bool": bool,
}


def validate(body: dict, schema: dict) -> dict:
    """
    body をスキーマに従って検証・サニタイズして返す。

    schema 例:
    {
        "incident_summary": {"type": "str", "required": True},
        "affected_count":   {"type": "int", "required": False},
    }

    Returns:
        サニタイズ済み dict

    Raises:
        ValidationError: 検証失敗時
    """
    sanitized = {}

    for field, rules in schema.items():
        required = rules.get("required", False)
        expected_type_name = rules.get("type", "str")
        expected_type = TYPE_MAP.get(expected_type_name, str)

        if field not in body:
            if required:
                raise ValidationError(f"フィールド '{field}' は必須です")
            continue

        value = body[field]

        if not isinstance(value, expected_type):
            raise ValidationError(f"'{field}' の型が不正です（期待: {expected_type_name}）")

        if isinstance(value, str):
            if len(value) > MAX_STRING_LENGTH:
                raise ValidationError(f"'{field}' は{MAX_STRING_LENGTH}文字以内で入力してください")
            for pattern in INJECTION_PATTERNS:
                if pattern.search(value):
                    raise ValidationError("不正な入力が含まれています")
            value = html.escape(value, quote=True)

        sanitized[field] = value

    return sanitized
