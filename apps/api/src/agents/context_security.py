from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

REDACTED_AGENT_CONTEXT_VALUE = "[REDACTED]"

_SENSITIVE_KEY_NAMES = frozenset({
    "password",
    "secret",
    "token",
    "apikey",
    "accesskey",
    "secretaccesskey",
    "credential",
    "authorization",
    "bearer",
    "privatekey",
})


def redact_sensitive_agent_context(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            key: _redact_sensitive_value(item) if _is_sensitive_key(key) else redact_sensitive_agent_context(item)
            for key, item in value.items()
        }
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return [redact_sensitive_agent_context(item) for item in value]
    return value


def _is_sensitive_key(key: Any) -> bool:
    if not isinstance(key, str):
        return False
    normalized = re.sub(r"[^a-z0-9]", "", key.lower())
    return normalized in _SENSITIVE_KEY_NAMES or normalized.endswith(("password", "secret", "token"))


def _redact_sensitive_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _redact_sensitive_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return [_redact_sensitive_value(item) for item in value]
    return REDACTED_AGENT_CONTEXT_VALUE
