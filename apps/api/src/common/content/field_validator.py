"""Field validation engine for ContentType field_schema."""

from __future__ import annotations

from typing import Any

from src.common.content.field_types import FIELD_KIND_VALIDATORS


def validate_field_values(
    field_schema: dict[str, Any] | None,
    field_values: dict[str, Any] | None,
) -> list[str]:
    """Validate field_values against a ContentTypeFieldSchema dict.

    Returns a list of error messages (empty = valid).
    """
    if not field_schema:
        return []

    version = field_schema.get("version")
    if version != 1:
        return [f"Unsupported field_schema version: {version}"]

    fields: list[dict[str, Any]] = field_schema.get("fields", [])
    values = field_values or {}
    errors: list[str] = []

    for field_def in fields:
        key = field_def.get("key", "")
        kind: str = field_def.get("kind", "")
        required = field_def.get("required", False)
        value = values.get(key)

        if value is None:
            if required:
                errors.append(f"Field '{key}' is required")
            continue

        kind_errors = _validate_kind(key, kind, value, field_def.get("validation"))
        errors.extend(kind_errors)

    return errors


def _validate_kind(
    key: str,
    kind: str,
    value: Any,
    validation: dict[str, Any] | None,
) -> list[str]:
    validator = FIELD_KIND_VALIDATORS.get(kind)
    if validator is None:
        return [f"Field '{key}': unknown kind '{kind}'"]
    return validator(key, value, validation or {})
