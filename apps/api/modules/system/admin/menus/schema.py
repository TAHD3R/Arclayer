from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema


class AdminMenuNode(BaseSchema):
    """
    Menu node used by frontend dynamic routing.

    - Groups can have path/name/component_key unset.
    - meta is a free-form JSON dict for route meta.
    """

    id: UUID = Field(..., description="Menu item id.")
    code: str = Field(..., description="Stable code (immutable).")
    title: str = Field(..., description="Display title (already localized if needed).")
    title_i18n: str | None = Field(default=None, description="Optional i18n ref, e.g. 'org:MENU_ORG'.")
    icon: str | None = Field(default=None, description="Icon key.")
    path: str | None = Field(default=None, description="Route path.")
    name: str | None = Field(default=None, description="Route name.")
    component_key: str | None = Field(default=None, description="Frontend component key for dynamic route.")
    redirect: str | None = Field(default=None, description="Optional redirect path.")
    sort: int = Field(default=0, description="Sort order.")
    permission_code: str | None = Field(
        default=None,
        description="Required permission code (null means admin:access only).",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Route meta.")
    children: list[AdminMenuNode] = Field(default_factory=list, description="Child nodes.")


class AdminMenuTreeOut(BaseSchema):
    items: list[AdminMenuNode] = Field(default_factory=list, description="Menu tree roots.")


class AdminMenuItemOut(BaseOut):
    code: str = Field(..., description="Stable code (immutable).")
    parent_id: UUID | None = Field(default=None, description="Parent menu item id.")
    title: str = Field(..., description="Title.")
    title_i18n: str | None = Field(default=None, description="I18n ref.")
    icon: str | None = Field(default=None, description="Icon key.")
    type: str = Field(..., description="Item type: group/item.")
    path: str | None = Field(default=None, description="Route path.")
    name: str | None = Field(default=None, description="Route name.")
    component_key: str | None = Field(default=None, description="Frontend component key.")
    redirect: str | None = Field(default=None, description="Redirect path.")
    sort: int = Field(default=0, description="Sort order.")
    is_active: bool = Field(default=True, description="Active flag.")
    permission_code: str | None = Field(
        default=None, description="Required permission code (null means admin:access only)."
    )
    meta: dict[str, Any] | None = Field(default=None, description="Meta JSON.")
    deleted_at: datetime | None = Field(default=None, description="Soft delete timestamp.")


class AdminMenuListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search by title/code/path/name.")
    include_deleted: bool = Field(default=False, description="Include deleted items.")
    parent_id: UUID | None = Field(default=None, description="Filter by parent id.")
    permission_code: str | None = Field(default=None, description="Filter by permission code.")
    ordering: str | None = Field(default=None, description="Ordering, e.g. 'sort,-created_at'.")


class AdminMenuCreateRequest(BaseSchema):
    code: str = Field(..., min_length=1, max_length=64, description="Stable code (immutable after create).")
    parent_id: UUID | None = Field(default=None, description="Parent id.")
    title: str = Field(..., min_length=1, max_length=128, description="Title.")
    title_i18n: str | None = Field(default=None, max_length=128, description="I18n ref.")
    icon: str | None = Field(default=None, max_length=64, description="Icon key.")
    type: str = Field(..., description="Item type: group/item.")
    path: str | None = Field(default=None, max_length=256, description="Route path.")
    name: str | None = Field(default=None, max_length=128, description="Route name.")
    component_key: str | None = Field(default=None, max_length=128, description="Frontend component key.")
    redirect: str | None = Field(default=None, max_length=256, description="Redirect path.")
    sort: int = Field(default=0, description="Sort order.")
    is_active: bool = Field(default=True, description="Active flag.")
    permission_code: str | None = Field(default=None, max_length=128, description="Permission code.")
    meta: dict[str, Any] | None = Field(default=None, description="Meta JSON.")


class AdminMenuUpdateRequest(BaseSchema):
    # code is intentionally excluded: immutable.
    parent_id: UUID | None = Field(default=None, description="Parent id.")
    title: str | None = Field(default=None, min_length=1, max_length=128, description="Title.")
    title_i18n: str | None = Field(default=None, max_length=128, description="I18n ref.")
    icon: str | None = Field(default=None, max_length=64, description="Icon key.")
    type: str | None = Field(default=None, description="Item type: group/item.")
    path: str | None = Field(default=None, max_length=256, description="Route path.")
    name: str | None = Field(default=None, max_length=128, description="Route name.")
    component_key: str | None = Field(default=None, max_length=128, description="Frontend component key.")
    redirect: str | None = Field(default=None, max_length=256, description="Redirect path.")
    sort: int | None = Field(default=None, description="Sort order.")
    is_active: bool | None = Field(default=None, description="Active flag.")
    permission_code: str | None = Field(default=None, max_length=128, description="Permission code.")
    meta: dict[str, Any] | None = Field(default=None, description="Meta JSON.")


class AdminMenuReorderRequest(BaseSchema):
    parent_id: UUID | None = Field(default=None, description="Parent id (null for root).")
    ordered_ids: list[UUID] = Field(..., min_length=1, description="Ids in desired order.")
