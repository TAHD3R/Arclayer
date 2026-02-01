from __future__ import annotations

import re
from uuid import UUID

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


def build_asset_object_key(*, workspace_id: UUID, asset_id: UUID, ext: str) -> str:
    safe_ext = (ext or "").lstrip(".").lower() or "bin"
    return f"workspaces/{workspace_id}/assets/{asset_id}.{safe_ext}"


def build_upload_part_object_key(*, workspace_id: UUID, upload_id: UUID, part_number: int) -> str:
    if part_number <= 0:
        raise ValueError("part_number must be >= 1")
    return f"workspaces/{workspace_id}/uploads/{upload_id}/part-{part_number:06d}"


def compute_total_parts(*, size_bytes: int, chunk_size_bytes: int) -> int:
    if size_bytes < 0:
        raise ValueError("size_bytes must be >= 0")
    if chunk_size_bytes <= 0:
        raise ValueError("chunk_size_bytes must be > 0")
    if size_bytes == 0:
        return 1
    return (size_bytes + chunk_size_bytes - 1) // chunk_size_bytes
