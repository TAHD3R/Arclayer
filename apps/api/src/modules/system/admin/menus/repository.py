from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from tortoise.queryset import QuerySet

from apps.api.src.common.protocols.tortoise import AdminMenuItemMutableFields
from apps.api.src.common.repositories import BaseRepository
from apps.api.src.modules.system.admin.menus.models import AdminMenuItem


class AdminMenuRepository(BaseRepository):
    def query_items(self, *, include_deleted: bool) -> QuerySet[AdminMenuItem]:
        qs = AdminMenuItem.all()
        if not include_deleted:
            qs = qs.filter(deleted_at__isnull=True)
        return qs

    def query_items_for_user(self) -> QuerySet[AdminMenuItem]:
        # Only active + not deleted items are visible candidates.
        return AdminMenuItem.filter(deleted_at__isnull=True, is_active=True)

    async def get_item_by_id(self, *, item_id: UUID, include_deleted: bool = False) -> AdminMenuItem | None:
        return await self.query_items(include_deleted=include_deleted).get_or_none(id=item_id)

    async def get_by_code(self, *, code: str) -> AdminMenuItem | None:
        return await AdminMenuItem.get_or_none(code=code)

    async def create_item(self, *, payload: dict) -> AdminMenuItem:
        return await AdminMenuItem.create(**payload)

    async def save_updates(self, item: AdminMenuItem, *, updates: dict) -> AdminMenuItem:
        for key, value in updates.items():
            setattr(item, key, value)
        await item.save()
        return item

    async def has_children(self, *, item_id: UUID) -> bool:
        return await AdminMenuItem.filter(parent_id=item_id, deleted_at__isnull=True).exists()

    async def soft_delete(self, item: AdminMenuItem) -> AdminMenuItem:
        if item.deleted_at is None:
            cast(AdminMenuItemMutableFields, item).deleted_at = datetime.now(UTC)
        item.is_active = False
        await item.save(update_fields=["deleted_at", "is_active"])
        return item

    async def restore(self, item: AdminMenuItem) -> AdminMenuItem:
        cast(AdminMenuItemMutableFields, item).deleted_at = None
        item.is_active = True
        await item.save(update_fields=["deleted_at", "is_active"])
        return item


_ALLOWED_ORDER_FIELDS = {
    "created_at",
    "updated_at",
    "sort",
    "code",
    "title",
    "path",
    "name",
}


def normalize_ordering(value: str) -> list[str]:
    fields: list[str] = []
    for part in (value or "").split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in _ALLOWED_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields or ["sort", "created_at"]
