from __future__ import annotations


def normalize_request_host(value: str | None) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    if raw.startswith("[") and "]" in raw:
        inner = raw[1 : raw.index("]")]
        return inner.strip().lower().rstrip(".")
    if ":" in raw and "]" not in raw:
        raw = raw.split(":", 1)[0]
    return raw.rstrip(".")
