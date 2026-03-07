from __future__ import annotations

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID


class ContentRouteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Route id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    entry_id: PublicUUID = Field(..., description="Entry id.")
    locale: str = Field(..., min_length=2, max_length=16, description="Route locale.")
    path: str = Field(..., min_length=1, max_length=512, description="Resolved pathname (e.g. /about).")
    is_active: bool = Field(default=True, description="Whether this route binding is active.")


class ContentRouteCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Target entry id.")
    locale: str = Field(default="zh-CN", min_length=2, max_length=16, description="Route locale.")
    path: str = Field(..., min_length=1, max_length=512, description="Route pathname.")
    is_active: bool = Field(default=True, description="Whether this route binding is active.")


class ContentRouteUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    locale: str | None = Field(default=None, min_length=2, max_length=16, description="Route locale.")
    path: str | None = Field(default=None, min_length=1, max_length=512, description="Route pathname.")
    is_active: bool | None = Field(default=None, description="Whether this route binding is active.")


class ContentRouteDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    route_id: PublicUUID = Field(..., description="Deleted route id.")


class ContentTreeNodeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Tree node id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    entry_id: PublicUUID = Field(..., description="Entry id.")
    parent_entry_id: PublicUUID | None = Field(default=None, description="Parent entry id (null for root).")
    sort_order: int = Field(default=0, description="Sort order within siblings.")


class ContentTreeNodeUpsertIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    parent_entry_id: PublicUUID | None = Field(default=None, description="Parent entry id (null for root).")
    sort_order: int = Field(default=0, description="Sort order within siblings.")


class ContentTreeNodeDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id whose tree node is deleted.")
