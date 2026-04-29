"""Unit tests for the input/output sanitizers."""

from __future__ import annotations

from src.core.sanitize.input import InputSanitizer
from src.core.sanitize.output import OutputSanitizer


class TestInputSanitizer:
    def test_strips_null_bytes(self):
        result = InputSanitizer.sanitize_value("hello\x00world")
        assert "\x00" not in result

    def test_escapes_html_in_text_fields(self):
        result = InputSanitizer.sanitize_value("<script>alert(1)</script>", field_type="text")
        assert "<script>" not in result

    def test_does_not_escape_html_in_rich_text(self):
        result = InputSanitizer.sanitize_value("<p>hello</p>", field_type="rich_text")
        assert "<p>" in result

    def test_does_not_escape_html_in_markdown(self):
        result = InputSanitizer.sanitize_value("**bold** <span>text</span>", field_type="markdown")
        assert "**bold**" in result

    def test_trims_whitespace(self):
        result = InputSanitizer.sanitize_value("  hello  ", field_type="text")
        assert result == "hello"

    def test_enforces_max_length(self):
        long_str = "x" * 100000
        result = InputSanitizer.sanitize_value(long_str, field_type="text")
        assert len(result) <= InputSanitizer.MAX_STRING_LENGTH

    def test_passes_numbers_through(self):
        assert InputSanitizer.sanitize_value(42, field_type="number") == 42
        assert InputSanitizer.sanitize_value(3.14, field_type="number") == 3.14

    def test_passes_booleans_through(self):
        assert InputSanitizer.sanitize_value(True, field_type="boolean") is True
        assert InputSanitizer.sanitize_value(False, field_type="boolean") is False

    def test_returns_none_for_none(self):
        assert InputSanitizer.sanitize_value(None, field_type="text") is None

    def test_sanitize_dict(self):
        data = {"name": "  <script>x</script>  ", "age": 25}
        result = InputSanitizer.sanitize_dict(data)
        assert "<script>" not in result["name"]
        assert result["age"] == 25

    def test_sanitize_dict_with_field_types(self):
        data = {"content": "<p>ok</p>", "name": "<b>name</b>"}
        result = InputSanitizer.sanitize_dict(data, field_types={"content": "rich_text", "name": "text"})
        assert "<p>" in result["content"]
        assert "<b>" not in result["name"]

    def test_sanitize_nested_dict(self):
        data = {"meta": {"title": "  <xss>  "}}
        result = InputSanitizer.sanitize_dict(data)
        assert "<xss>" not in result["meta"]["title"]

    def test_sanitize_list_of_strings(self):
        result = InputSanitizer.sanitize_value(["  a  ", "  <b>  "], field_type="text")
        assert result[0] == "a"
        assert "<b>" not in result[1]


class TestOutputSanitizer:
    def test_filters_sensitive_fields(self):
        data = {"name": "ok", "password": "secret", "token": "abc"}
        result = OutputSanitizer.sanitize_response(data)
        assert "name" in result
        assert "password" not in result
        assert "token" not in result

    def test_filters_password_hash(self):
        data = {"user": "test", "password_hash": "hash"}
        result = OutputSanitizer.sanitize_response(data)
        assert "user" in result
        assert "password_hash" not in result

    def test_filters_api_key_secret(self):
        data = {"key": "public", "api_key_secret": "shh"}
        result = OutputSanitizer.sanitize_response(data)
        assert "key" in result
        assert "api_key_secret" not in result

    def test_filters_refresh_token(self):
        data = {"access_token": "x", "refresh_token": "y"}
        result = OutputSanitizer.sanitize_response(data)
        assert "access_token" in result
        assert "refresh_token" not in result

    def test_respects_omitted_field_keys(self):
        data = {"public": "yes", "internal": "no"}
        result = OutputSanitizer.sanitize_response(data, omitted_field_keys=frozenset({"internal"}))
        assert "public" in result
        assert "internal" not in result

    def test_handles_nested_structures(self):
        data = {
            "items": [
                {"name": "a", "password": "x"},
                {"name": "b", "secret": "y"},
            ]
        }
        result = OutputSanitizer.sanitize_response(data)
        assert result["items"][0]["name"] == "a"
        assert "password" not in result["items"][0]
        assert "secret" not in result["items"][1]

    def test_passes_primitives_through(self):
        assert OutputSanitizer.sanitize_response("hello") == "hello"
        assert OutputSanitizer.sanitize_response(42) == 42
        assert OutputSanitizer.sanitize_response(True) is True

    def test_respects_max_depth(self):
        deep = {"a": {"b": {"c": {"d": {"e": {"f": "too deep"}}}}}}
        result = OutputSanitizer.sanitize_response(deep, max_depth=3)
        assert result is not None
