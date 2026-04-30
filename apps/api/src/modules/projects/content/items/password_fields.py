from __future__ import annotations

from typing import Any

from src.modules.auth.password.service import hash_password

PASSWORD_FIELD_KIND = "password"


def is_password_field_config(config: Any) -> bool:
    return isinstance(config, dict) and config.get("kind") == PASSWORD_FIELD_KIND


def password_field_keys(model_definition: Any) -> frozenset[str]:
    fields = getattr(model_definition, "fields", None)
    if fields is None:
        return frozenset()
    return frozenset(
        str(getattr(field, "key", "")).strip()
        for field in fields
        if is_password_field_config(getattr(field, "config", None)) and str(getattr(field, "key", "")).strip()
    )


def sanitize_password_field_values(
    payload: dict[str, Any] | None,
    *,
    password_keys: frozenset[str],
) -> dict[str, Any]:
    if not isinstance(payload, dict) or not password_keys:
        return dict(payload or {})
    return {str(key): value for key, value in payload.items() if str(key) not in password_keys}


def sanitize_password_presentations(
    presentations: list[tuple[Any, dict[str, Any] | None]],
    *,
    password_keys: frozenset[str],
) -> list[tuple[Any, dict[str, Any] | None]]:
    if not password_keys:
        return presentations
    return [
        (
            kind,
            sanitize_password_field_values(payload, password_keys=password_keys)
            if isinstance(payload, dict)
            else payload,
        )
        for kind, payload in presentations
    ]


def carry_forward_missing_password_field_values(
    payload: dict[str, Any],
    *,
    previous_payload: dict[str, Any] | None,
    model_definition: Any,
) -> dict[str, Any]:
    keys = password_field_keys(model_definition)
    if not keys or not isinstance(previous_payload, dict):
        return dict(payload)
    out = dict(payload)
    for key in keys:
        if key not in out and key in previous_payload:
            out[key] = previous_payload[key]
    return out


def hash_password_field_values(
    payload: dict[str, Any],
    *,
    model_definition: Any,
) -> dict[str, Any]:
    keys = password_field_keys(model_definition)
    if not keys:
        return dict(payload)
    out = dict(payload)
    for key in keys:
        if key not in out:
            continue
        value = out.get(key)
        if value is None:
            continue
        if not isinstance(value, str):
            raise ValueError(f"Password field '{key}' must be a string")
        if not value:
            out.pop(key, None)
            continue
        out[key] = hash_password(value)
    return out
