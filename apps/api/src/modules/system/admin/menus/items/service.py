from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.expressions import Q

from apps.api.src.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.src.modules.system.admin.menus.models.service import AdminMenuItem, AdminMenuItemType
from apps.api.src.modules.system.admin.menus.repository import AdminMenuRepository, normalize_ordering
from apps.api.src.modules.system.admin.menus.schema import (
    AdminMenuCreateRequest,
    AdminMenuItemOut,
    AdminMenuListQuery,
    AdminMenuReorderRequest,
    AdminMenuUpdateRequest,
)
from apps.api.src.modules.system.admin.menus.shared.service import get_parent_id, tr

_SORT_STEP: int = 10


class AdminMenuItemsMixin:
    repo: AdminMenuRepository

    async def list_items(self, *, params: PageParams, filters: AdminMenuListQuery) -> PageData[AdminMenuItemOut]:
        qs = self.repo.query_items(include_deleted=bool(filters.include_deleted))
        if filters.parent_id is not None:
            qs = qs.filter(parent_id=filters.parent_id)
        if filters.permission_code:
            qs = qs.filter(permission_code=filters.permission_code)
        if filters.q:
            needle = filters.q.strip()
            if needle:
                qs = qs.filter(
                    Q(code__icontains=needle)
                    | Q(title__icontains=needle)
                    | Q(path__icontains=needle)
                    | Q(name__icontains=needle)
                )
        ordering = (filters.ordering or "").strip()
        qs = qs.order_by(*normalize_ordering(ordering)) if ordering else qs.order_by("sort", "created_at")
        return await paginate_queryset(qs, params=params, out_schema=AdminMenuItemOut)

    async def get_item(self, *, item_id: UUID) -> AdminMenuItemOut:
        item = await self.repo.get_item_by_id(item_id=item_id, include_deleted=True)
        if item is None:
            raise NotFound(message=tr("ITEM_NOT_FOUND", "菜单项不存在"), error="ITEM_NOT_FOUND")
        return AdminMenuItemOut.model_validate(item, from_attributes=True)

    async def create_item(self, *, payload: AdminMenuCreateRequest) -> AdminMenuItemOut:
        code = payload.code.strip()
        if await self.repo.get_by_code(code=code) is not None:
            raise Conflict(message=tr("ITEM_CODE_EXISTS", "菜单编码已存在"), error="ITEM_CODE_EXISTS")

        parent_id = payload.parent_id
        if parent_id is not None and await self.repo.get_item_by_id(item_id=parent_id, include_deleted=False) is None:
            raise BadRequest(message=tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")

        item_type = self._normalize_item_type(payload.type)
        path, name = self._normalize_item_route(payload.path, payload.name)
        self._validate_item_route(item_type=item_type, path=path, name=name)

        item = await self.repo.create_item(
            payload={
                "code": code,
                "parent_id": parent_id,
                "title": payload.title,
                "title_i18n": payload.title_i18n,
                "icon": payload.icon,
                "type": item_type,
                "path": path,
                "name": name,
                "component_key": payload.component_key,
                "redirect": payload.redirect,
                "sort": payload.sort,
                "is_active": payload.is_active,
                "permission_code": payload.permission_code,
                "meta": payload.meta,
                "deleted_at": None,
            }
        )
        return AdminMenuItemOut.model_validate(item, from_attributes=True)

    def _normalize_item_type(self, raw: object) -> AdminMenuItemType:
        value = str(raw).strip().lower()
        if value not in {"group", "item"}:
            raise BadRequest(message="type 不合法", error="BAD_REQUEST")
        return AdminMenuItemType(value)

    def _normalize_item_route(self, path: str | None, name: str | None) -> tuple[str | None, str | None]:
        return (path.strip() if path else None, name.strip() if name else None)

    def _validate_item_route(self, *, item_type: AdminMenuItemType, path: str | None, name: str | None) -> None:
        if item_type != AdminMenuItemType.ITEM:
            return
        if not path or not path.startswith("/"):
            raise BadRequest(message="path 不合法", error="BAD_REQUEST")
        if not name:
            raise BadRequest(message="name 不合法", error="BAD_REQUEST")

    async def update_item(self, *, item_id: UUID, payload: AdminMenuUpdateRequest) -> AdminMenuItemOut:
        item = await self.repo.get_item_by_id(item_id=item_id, include_deleted=True)
        if item is None:
            raise NotFound(message=tr("ITEM_NOT_FOUND", "菜单项不存在"), error="ITEM_NOT_FOUND")

        raw_updates = payload.model_dump(exclude_unset=True)
        updates = cast(dict[str, object], raw_updates)
        updates.pop("code", None)

        await self._validate_parent_update(item=item, updates=updates)
        self._coerce_type_update(updates)
        self._normalize_route_updates(updates)
        self._validate_next_route(item=item, updates=updates)

        saved = await self.repo.save_updates(item, updates=updates)
        return AdminMenuItemOut.model_validate(saved, from_attributes=True)

    async def _validate_parent_update(self, *, item: AdminMenuItem, updates: dict[str, object]) -> None:
        if "parent_id" not in updates:
            return
        new_parent_id = updates.get("parent_id")
        if new_parent_id == item.id:
            raise BadRequest(message=tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")
        if new_parent_id is None:
            return
        parent_id = UUID(str(new_parent_id))
        if await self.repo.get_item_by_id(item_id=parent_id, include_deleted=False) is None:
            raise BadRequest(message=tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")
        if await self._is_descendant(candidate_id=parent_id, ancestor_id=UUID(str(item.id))):
            raise BadRequest(message=tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")

    def _coerce_type_update(self, updates: dict[str, object]) -> None:
        if "type" not in updates or updates["type"] is None:
            return
        updates["type"] = self._normalize_item_type(updates["type"])

    def _normalize_route_updates(self, updates: dict[str, object]) -> None:
        if "path" in updates and updates["path"] is not None:
            updates["path"] = str(updates["path"]).strip()
        if "name" in updates and updates["name"] is not None:
            updates["name"] = str(updates["name"]).strip()

    def _validate_next_route(self, *, item: AdminMenuItem, updates: dict[str, object]) -> None:
        next_type = cast(AdminMenuItemType, updates.get("type", item.type))
        next_path = cast(str | None, updates.get("path", item.path))
        next_name = cast(str | None, updates.get("name", item.name))
        self._validate_item_route(item_type=next_type, path=next_path, name=next_name)

    async def delete_item(self, *, item_id: UUID) -> None:
        item = await self.repo.get_item_by_id(item_id=item_id, include_deleted=False)
        if item is None:
            raise NotFound(message=tr("ITEM_NOT_FOUND", "菜单项不存在"), error="ITEM_NOT_FOUND")
        if await self.repo.has_children(item_id=item_id):
            raise BadRequest(message=tr("ITEM_HAS_CHILDREN", "菜单项下存在子项，无法删除"), error="ITEM_HAS_CHILDREN")
        await self.repo.soft_delete(item)

    async def restore_item(self, *, item_id: UUID) -> AdminMenuItemOut:
        item = await self.repo.get_item_by_id(item_id=item_id, include_deleted=True)
        if item is None:
            raise NotFound(message=tr("ITEM_NOT_FOUND", "菜单项不存在"), error="ITEM_NOT_FOUND")
        if item.deleted_at is None:
            return AdminMenuItemOut.model_validate(item, from_attributes=True)

        parent_id = get_parent_id(item)
        if parent_id is not None and await self.repo.get_item_by_id(item_id=parent_id, include_deleted=False) is None:
            raise BadRequest(message=tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")

        restored = await self.repo.restore(item)
        return AdminMenuItemOut.model_validate(restored, from_attributes=True)

    async def reorder(self, *, payload: AdminMenuReorderRequest) -> None:
        rows = await AdminMenuItem.filter(id__in=payload.ordered_ids, deleted_at__isnull=True).all()
        found = {r.id for r in rows}
        missing = [str(mid) for mid in payload.ordered_ids if mid not in found]
        if missing:
            raise NotFound(
                message=tr("ITEM_NOT_FOUND", "菜单项不存在"),
                error="ITEM_NOT_FOUND",
                details={"missing": missing},
            )

        parent_ids = {get_parent_id(r) for r in rows}
        if len(parent_ids) != 1 or next(iter(parent_ids)) != payload.parent_id:
            raise BadRequest(message="parentId 不一致", error="BAD_REQUEST")

        for idx, mid in enumerate(payload.ordered_ids):
            await AdminMenuItem.filter(id=mid).update(sort=idx * _SORT_STEP)

    async def _is_descendant(self, *, candidate_id: UUID, ancestor_id: UUID) -> bool:
        current = await AdminMenuItem.get_or_none(id=candidate_id)
        seen: set[UUID] = set()
        while current is not None:
            parent_id = get_parent_id(current)
            if parent_id is None:
                break
            if parent_id == ancestor_id:
                return True
            if parent_id in seen:
                return True
            seen.add(parent_id)
            current = await AdminMenuItem.get_or_none(id=parent_id)
        return False
