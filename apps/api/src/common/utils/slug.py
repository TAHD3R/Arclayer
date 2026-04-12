from __future__ import annotations

import re

_NON_SLUG_CHARS = re.compile(r"[^a-z0-9._-]+")
_MULTI_HYPHEN = re.compile(r"-{2,}")


def slugify(value: str) -> str:
    """
    Generate a safe ASCII slug for public URLs.

    Notes:
    - Keep it deterministic and provider-agnostic.
    - Do not attempt transliteration here; callers can provide a title in English if desired.
    """

    raw = (value or "").strip().lower()
    if not raw:
        return "asset"

    raw = raw.replace(" ", "-")
    raw = _NON_SLUG_CHARS.sub("-", raw)
    raw = _MULTI_HYPHEN.sub("-", raw)
    raw = raw.strip("-")
    return raw or "asset"
