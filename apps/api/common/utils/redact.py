from __future__ import annotations

from typing import Any

SENSITIVE_KEYS = {
    "password",
    "passwd",
    "pwd",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "id_card",
    "phone",
}


def redact(obj: Any, max_len: int = 2048) -> Any:
    """Shallow redaction for dict/list/scalars with a simple size cap."""
    try:
        if isinstance(obj, dict):
            return {k: ("***" if k.lower() in SENSITIVE_KEYS else redact(v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [redact(v) for v in obj][:100]
        if isinstance(obj, str):
            return obj[:max_len]
        return obj
    except Exception:
        return None
