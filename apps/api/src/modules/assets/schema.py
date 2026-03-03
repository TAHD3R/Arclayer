from __future__ import annotations

from pydantic import ConfigDict

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID


class AssetPublicView(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: PublicUUID
    slug: str
    ext: str
    mime: str | None
    checksum_sha256: str | None
    original_filename: str | None
    object_key: str
    storage_bucket: str | None
    indexable: bool
    variants: dict | None
    storage_provider: str
