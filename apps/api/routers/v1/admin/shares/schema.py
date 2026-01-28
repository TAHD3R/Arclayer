from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field, computed_field

from apps.api.common.schemas import BaseOut, BaseSchema


class AdminShareCreateRequest(BaseSchema):
    expires_in_seconds: int | None = Field(
        default=None,
        ge=60,
        le=365 * 24 * 3600,
        description="Share link expiration in seconds (null = never expires).",
    )


class AdminShareLinkOut(BaseOut):
    asset_id: UUID = Field(..., description="Asset id.")
    token: str = Field(..., description="Opaque share token.")
    expires_at: datetime | None = Field(default=None, description="Expiration time.")
    revoked_at: datetime | None = Field(default=None, description="Revoked time.")
    created_at: datetime = Field(..., description="Created at.")

    @computed_field
    @property
    def preview_url_path(self) -> str:
        return f"/s/{self.token}"

    @computed_field
    @property
    def download_url_path(self) -> str:
        return f"/s/{self.token}/download"


class AdminShareRevokeOut(BaseSchema):
    id: UUID = Field(..., description="Share link id.")
    revoked_at: datetime = Field(..., description="Revoked time.")
