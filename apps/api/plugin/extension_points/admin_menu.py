from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.core.http.pagination import PageData, PageParams
from apps.api.plugin.registry import ExtensionPointType, registry

ADMIN_MENU_PROVIDER_EXTENSION_POINT = "admin-menu-provider"


class AdminMenuProvider(Protocol):
    # Current user menu (filtered by permission codes).
    async def get_menu(self, *, user_id: UUID): ...

    # Admin management endpoints (CRUD).
    async def list_items(self, *, params: PageParams, filters) -> PageData: ...

    async def get_item(self, *, item_id: UUID): ...

    async def create_item(self, *, payload): ...

    async def update_item(self, *, item_id: UUID, payload): ...

    async def delete_item(self, *, item_id: UUID) -> None: ...

    async def restore_item(self, *, item_id: UUID): ...

    async def reorder(self, *, payload) -> None: ...


def _register_admin_menu_extension_point() -> None:
    registry.register_extension_point(
        ADMIN_MENU_PROVIDER_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Admin menu management provider (menu CRUD + filtered menu tree for current user).",
    )


_register_admin_menu_extension_point()


def get_admin_menu_provider() -> AdminMenuProvider | None:
    provider = registry.get_extension(ADMIN_MENU_PROVIDER_EXTENSION_POINT)
    return cast(AdminMenuProvider | None, provider)
