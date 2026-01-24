from __future__ import annotations

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class AdminUINavNode(BaseSchema):
    id: str = Field(..., description="Resource identifier.")
    title: str = Field(..., description="Localized title.")
    icon: str | None = Field(default=None, description="Icon key.")
    path: str | None = Field(default=None, description="Frontend route path.")
    sort: int = Field(default=0, description="Sort order.")
    children: list[AdminUINavNode] = Field(default_factory=list, description="Child nodes.")


class AdminUIActionState(BaseSchema):
    id: str = Field(..., description="Action identifier.")
    title: str = Field(..., description="Localized title.")
    enabled: bool = Field(..., description="Whether the action is enabled for current user.")
    required_permissions_any: list[str] = Field(default_factory=list, description="Any-of permission codes.")
    required_permissions_all: list[str] = Field(default_factory=list, description="All-of permission codes.")


class AdminUIContext(BaseSchema):
    nav_tree: list[AdminUINavNode] = Field(default_factory=list, description="Filtered navigation tree.")
    actions: dict[str, AdminUIActionState] = Field(default_factory=dict, description="Action states by action id.")
