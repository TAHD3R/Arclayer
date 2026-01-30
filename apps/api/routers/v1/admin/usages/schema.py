from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema


class AdminAssetUsageUpsertRequest(BaseSchema):
    asset_id: UUID = Field(..., description="Referenced asset id.")
    purpose: str = Field(..., min_length=1, max_length=64, description="Usage purpose.")
    entity_type: str = Field(..., min_length=1, max_length=128, description="Entity type (string convention).")
    entity_id: str = Field(..., min_length=1, max_length=128, description="Entity id (string).")
    field_key: str = Field(..., min_length=1, max_length=128, description="Field key (dot path).")


class AdminAssetUsageDeleteRequest(BaseSchema):
    entity_type: str = Field(..., min_length=1, max_length=128)
    entity_id: str = Field(..., min_length=1, max_length=128)
    field_key: str = Field(..., min_length=1, max_length=128)


class AdminAssetUsageOut(BaseOut):
    asset_id: UUID = Field(..., description="Referenced asset id.")
    purpose: str = Field(..., description="Usage purpose.")
    entity_type: str = Field(..., description="Entity type.")
    entity_id: str = Field(..., description="Entity id.")
    field_key: str = Field(..., description="Field key.")
    created_by_user_id: UUID | None = Field(default=None, description="Creator user id.")
    created_at: datetime = Field(..., description="Created at.")
    updated_at: datetime = Field(..., description="Updated at.")


class AdminAssetUsageDeleteOut(BaseSchema):
    deleted: bool = Field(..., description="Whether a record was deleted.")
