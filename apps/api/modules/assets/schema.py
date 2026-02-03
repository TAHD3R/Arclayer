from __future__ import annotations

from uuid import UUID

from pydantic import ConfigDict

from apps.api.common.schemas import BaseSchema


class AssetPublicView(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: UUID
    slug: str
    ext: str
    mime: str | None
    checksum_sha256: str | None
    original_filename: str | None
    object_key: str
    indexable: bool
    variants: dict | None
    storage_provider: str
