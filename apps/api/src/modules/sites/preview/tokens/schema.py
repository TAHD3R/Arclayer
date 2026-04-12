from __future__ import annotations

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class SitePreviewTokenCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    ttl_seconds: int = Field(
        default=600,
        ge=60,
        le=60 * 60,
        description="Token TTL in seconds (stub-only).",
        examples=[600],
    )


class SitePreviewTokenOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    token: str = Field(..., description="Preview token.")
    expires_at_ms: int = Field(..., description="Expiration timestamp in milliseconds (UTC).")
