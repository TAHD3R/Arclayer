from __future__ import annotations

from uuid import UUID

from src.modules.jobs.hashing import hash_json


def build_url_source_revision(
    *,
    source_id: UUID,
    normalized_url: str,
    locale: str,
) -> str:
    digest = hash_json({
        "kind": "url",
        "sourceId": str(source_id),
        "url": normalized_url,
        "locale": locale,
    })
    return f"sha256:{digest}"
