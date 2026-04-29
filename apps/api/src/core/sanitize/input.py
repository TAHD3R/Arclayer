from __future__ import annotations

import html
import re
from typing import Any

_HTML_TAG_RE = re.compile(r"<[^>]*>", re.IGNORECASE)
_NULL_BYTE_RE = re.compile(r"\x00")


def strip_null_bytes(value: str) -> str:
    return _NULL_BYTE_RE.sub("", value)


def sanitize_html_input(value: str) -> str:
    stripped = strip_null_bytes(value)
    return html.escape(_HTML_TAG_RE.sub("", stripped))


class InputSanitizer:
    """Sanitizes user input before persistence.

    - Strips null bytes from all string inputs
    - Escapes HTML in text fields (unless rich_text/markdown)
    - Trims whitespace
    - Enforces max length on string fields
    """

    MAX_STRING_LENGTH = 65535
    RICH_FIELD_TYPES = frozenset({"rich_text", "markdown", "blocks", "json_object", "dynamic_zone"})

    @classmethod
    def sanitize_value(cls, value: Any, *, field_type: str = "text") -> Any:
        if value is None:
            return None
        if isinstance(value, str):
            return cls._sanitize_string(value, field_type=field_type)
        if isinstance(value, dict):
            return {k: cls.sanitize_value(v, field_type=field_type) for k, v in value.items()}
        if isinstance(value, list):
            return [cls.sanitize_value(item, field_type=field_type) for item in value]
        if isinstance(value, int | float | bool):
            return value
        return str(value)

    @classmethod
    def sanitize_dict(cls, data: dict[str, Any], *, field_types: dict[str, str] | None = None) -> dict[str, Any]:
        types = field_types or {}
        return {k: cls.sanitize_value(v, field_type=types.get(k, "text")) for k, v in data.items()}

    @classmethod
    def _sanitize_string(cls, value: str, *, field_type: str) -> str:
        cleaned = strip_null_bytes(value).strip()
        if field_type in cls.RICH_FIELD_TYPES:
            cleaned = strip_null_bytes(cleaned)
        else:
            cleaned = sanitize_html_input(cleaned)
        return cleaned[: cls.MAX_STRING_LENGTH]
