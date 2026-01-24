from __future__ import annotations

from enum import StrEnum
from typing import Any, Protocol, cast
from uuid import UUID

from pydantic import BaseModel, Field

from apps.api.plugin.registry import ExtensionPointType, registry

ADMIN_UI_RESOURCE_PROVIDER_EXTENSION_POINT = "admin-ui-resource-provider"
ADMIN_UI_CONTEXT_PROVIDER_EXTENSION_POINT = "admin-ui-context-provider"


class AdminUIResourceType(StrEnum):
    MENU_GROUP = "menu_group"
    MENU_ITEM = "menu_item"
    ACTION = "action"


class AdminUIResourceSpec(BaseModel):
    """
    UI resource definition provided by plugins.

    This is intentionally minimal and stable. The admin UI context provider can
    localize and filter these resources based on user's permission codes.
    """

    id: str = Field(..., min_length=1, description="Stable resource identifier.")
    type: AdminUIResourceType = Field(..., description="Resource type.")
    plugin_id: str | None = Field(default=None, description="Owning plugin identifier.")
    parent_id: str | None = Field(default=None, description="Parent resource identifier.")

    title: str = Field(..., min_length=1, description="Default title (fallback when i18n missing).")
    title_i18n: str | None = Field(default=None, description="I18n ref for title, e.g. 'org:MENU_ORG'.")
    icon: str | None = Field(default=None, description="Icon key for admin UI.")
    path: str | None = Field(default=None, description="Frontend route path for menu item.")
    sort: int = Field(default=0, description="Sort order.")

    required_permissions_any: list[str] = Field(default_factory=list, description="Any-of permission codes.")
    required_permissions_all: list[str] = Field(default_factory=list, description="All-of permission codes.")


class AdminUIResourceProvider(Protocol):
    def get_resources(self) -> list[AdminUIResourceSpec]: ...


class AdminUIContextProvider(Protocol):
    async def get_context(self, user_id: UUID) -> dict[str, Any]: ...


def _register_admin_ui_extension_points() -> None:
    registry.register_extension_point(
        ADMIN_UI_RESOURCE_PROVIDER_EXTENSION_POINT,
        ExtensionPointType.MULTI_INSTANCE,
        description="Provides admin UI resource definitions (menus/actions).",
    )
    registry.register_extension_point(
        ADMIN_UI_CONTEXT_PROVIDER_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Builds admin UI context for current user (filtered nav + action states).",
    )


_register_admin_ui_extension_points()


def get_admin_ui_resource_providers() -> list[AdminUIResourceProvider]:
    providers = registry.get_extension(ADMIN_UI_RESOURCE_PROVIDER_EXTENSION_POINT) or []
    return cast(list[AdminUIResourceProvider], providers)


def get_admin_ui_context_provider() -> AdminUIContextProvider | None:
    provider = registry.get_extension(ADMIN_UI_CONTEXT_PROVIDER_EXTENSION_POINT)
    return cast(AdminUIContextProvider | None, provider)
