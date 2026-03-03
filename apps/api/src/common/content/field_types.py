"""Per-kind field validators."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

FieldKind = str
KindValidator = Callable[[str, Any, dict[str, Any]], list[str]]


def _validate_text(key: str, value: Any, validation: dict[str, Any]) -> list[str]:
    if not isinstance(value, (str, dict)):
        return [f"Field '{key}': expected text, got {type(value).__name__}"]
    raw = value if isinstance(value, str) else next(iter(value.values()), "")
    errors: list[str] = []
    if "min" in validation and len(raw) < validation["min"]:
        errors.append(f"Field '{key}': min length {validation['min']}")
    if "max" in validation and len(raw) > validation["max"]:
        errors.append(f"Field '{key}': max length {validation['max']}")
    if "pattern" in validation and not re.search(validation["pattern"], raw):
        errors.append(f"Field '{key}': pattern mismatch")
    return errors


def _validate_number(key: str, value: Any, validation: dict[str, Any]) -> list[str]:
    if not isinstance(value, (int, float)):
        return [f"Field '{key}': expected number"]
    errors: list[str] = []
    if "min" in validation and value < validation["min"]:
        errors.append(f"Field '{key}': min {validation['min']}")
    if "max" in validation and value > validation["max"]:
        errors.append(f"Field '{key}': max {validation['max']}")
    return errors


def _validate_boolean(key: str, value: Any, _v: dict[str, Any]) -> list[str]:
    if not isinstance(value, bool):
        return [f"Field '{key}': expected boolean"]
    return []


def _validate_select(key: str, value: Any, validation: dict[str, Any]) -> list[str]:
    options = validation.get("options", [])
    allowed = {o["value"] for o in options if isinstance(o, dict)}
    if value not in allowed:
        return [f"Field '{key}': invalid option '{value}'"]
    return []


def _validate_reference(key: str, value: Any, _v: dict[str, Any]) -> list[str]:
    if not isinstance(value, dict) or value.get("_type") != "reference":
        return [f"Field '{key}': expected reference object"]
    if not value.get("_ref"):
        return [f"Field '{key}': missing _ref"]
    return []


def _validate_array(key: str, value: Any, _v: dict[str, Any]) -> list[str]:
    if not isinstance(value, list):
        return [f"Field '{key}': expected array"]
    return []


def _validate_object(key: str, value: Any, _v: dict[str, Any]) -> list[str]:
    if not isinstance(value, dict):
        return [f"Field '{key}': expected object"]
    return []


def _validate_passthrough(key: str, value: Any, _v: dict[str, Any]) -> list[str]:
    return []


FIELD_KIND_VALIDATORS: dict[str, KindValidator] = {
    "text": _validate_text,
    "richtext": _validate_passthrough,
    "number": _validate_number,
    "boolean": _validate_boolean,
    "date": _validate_text,
    "media": _validate_text,
    "reference": _validate_reference,
    "object": _validate_object,
    "array": _validate_array,
    "select": _validate_select,
    "color": _validate_text,
    "url": _validate_text,
    "json": _validate_passthrough,
}
