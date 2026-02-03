from __future__ import annotations

from uuid import UUID

from admin_menu.services import AdminMenuService
from apps.api.core.http.pagination import PageData, PageParams
from apps.api.modules.system.admin.menus.schema import (
    AdminMenuCreateRequest,
    AdminMenuItemOut,
    AdminMenuListQuery,
    AdminMenuReorderRequest,
    AdminMenuTreeOut,
    AdminMenuUpdateRequest,
)


class AdminMenuProviderImpl:
    async def get_menu(self, *, user_id: UUID) -> AdminMenuTreeOut:
        service = AdminMenuService()
        return await service.get_menu(user_id=user_id)

    async def list_items(self, *, params: PageParams, filters: AdminMenuListQuery) -> PageData[AdminMenuItemOut]:
        service = AdminMenuService()
        return await service.list_items(params=params, filters=filters)

    async def get_item(self, *, item_id: UUID) -> AdminMenuItemOut:
        service = AdminMenuService()
        return await service.get_item(item_id=item_id)

    async def create_item(self, *, payload: AdminMenuCreateRequest) -> AdminMenuItemOut:
        service = AdminMenuService()
        return await service.create_item(payload=payload)

    async def update_item(self, *, item_id: UUID, payload: AdminMenuUpdateRequest) -> AdminMenuItemOut:
        service = AdminMenuService()
        return await service.update_item(item_id=item_id, payload=payload)

    async def delete_item(self, *, item_id: UUID) -> None:
        service = AdminMenuService()
        await service.delete_item(item_id=item_id)

    async def restore_item(self, *, item_id: UUID) -> AdminMenuItemOut:
        service = AdminMenuService()
        return await service.restore_item(item_id=item_id)

    async def reorder(self, *, payload: AdminMenuReorderRequest) -> None:
        service = AdminMenuService()
        await service.reorder(payload=payload)
