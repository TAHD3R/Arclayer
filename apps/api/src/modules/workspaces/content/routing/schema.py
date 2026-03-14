from __future__ import annotations

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID


class RouteBindingOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Route binding id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    item_id: PublicUUID = Field(..., description="Item id.")
    locale: str = Field(..., min_length=2, max_length=16, description="Route locale.")
    path: str = Field(..., min_length=1, max_length=512, description="Resolved pathname.")
    is_active: bool = Field(default=True, description="Whether this binding is active.")


class RouteBindingUpsertIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    locale: str = Field(default="zh-CN", min_length=2, max_length=16, description="Route locale.")
    path: str = Field(..., min_length=1, max_length=512, description="Route pathname.")
    is_active: bool = Field(default=True, description="Whether this binding is active.")


class HierarchyNodeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Hierarchy node id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    item_id: PublicUUID = Field(..., description="Item id.")
    parent_item_id: PublicUUID | None = Field(default=None, description="Parent item id.")
    sort_order: int = Field(default=0, description="Sibling order.")


class HierarchyNodeUpsertIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    parent_item_id: PublicUUID | None = Field(default=None, description="Parent item id.")
    sort_order: int = Field(default=0, description="Sibling order.")
