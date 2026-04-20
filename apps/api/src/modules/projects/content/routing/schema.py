from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class RoutePrimarySourceOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    model_key: str = Field(..., alias="modelKey", min_length=1, max_length=64, description="Primary source model key.")
    field_key: str = Field(..., alias="fieldKey", min_length=1, max_length=64, description="Lookup field key.")
    param_name: str = Field(..., alias="paramName", min_length=1, max_length=64, description="Route param name.")


class RoutePrimarySourceIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    model_key: str = Field(..., alias="modelKey", min_length=1, max_length=64, description="Primary source model key.")
    field_key: str = Field(..., alias="fieldKey", min_length=1, max_length=64, description="Lookup field key.")
    param_name: str = Field(..., alias="paramName", min_length=1, max_length=64, description="Route param name.")


class RouteBindingOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Route binding id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    item_id: PublicUUID = Field(..., description="Item id.")
    locale: str = Field(..., min_length=2, max_length=16, description="Route locale.")
    path: str = Field(..., min_length=1, max_length=512, description="Route pattern.")
    route_mode: Literal["static", "dynamic"] = Field(
        default="static",
        alias="routeMode",
        description="Route mode derived from the persisted route contract.",
    )
    route_priority: int = Field(
        default=0,
        alias="routePriority",
        description="Explicit route priority applied after specificity sorting.",
    )
    structure_signature: str = Field(
        default="",
        alias="structureSignature",
        description="Normalized structural signature used for ambiguity checks.",
    )
    primary_source: RoutePrimarySourceOut | None = Field(
        default=None,
        alias="primarySource",
        description="Primary source declaration for dynamic routes.",
    )
    is_active: bool = Field(default=True, description="Whether this binding is active.")


class RouteBindingUpsertIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    locale: str = Field(default="zh-CN", min_length=2, max_length=16, description="Route locale.")
    path: str = Field(..., min_length=1, max_length=512, description="Route pattern.")
    route_mode: Literal["static", "dynamic"] | None = Field(
        default=None,
        alias="routeMode",
        description="Optional route mode override. When omitted it is inferred from the pattern.",
    )
    route_priority: int = Field(
        default=0,
        alias="routePriority",
        description="Explicit route priority applied after specificity sorting.",
    )
    primary_source: RoutePrimarySourceIn | None = Field(
        default=None,
        alias="primarySource",
        description="Primary source declaration required for dynamic routes.",
    )
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
