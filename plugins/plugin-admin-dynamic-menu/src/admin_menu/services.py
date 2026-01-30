from __future__ import annotations

from uuid import UUID

from tortoise.expressions import Q

from admin_menu.models import AdminMenuItem, AdminMenuItemType
from admin_menu.repository import AdminMenuRepository, normalize_ordering
from apps.api.common.services import BaseService
from apps.api.config import get_settings
from apps.api.core.authz import get_authz_snapshot_provider
from apps.api.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.routers.v1.admin.menus.schema import (
    AdminMenuCreateRequest,
    AdminMenuItemOut,
    AdminMenuListQuery,
    AdminMenuNode,
    AdminMenuReorderRequest,
    AdminMenuTreeOut,
    AdminMenuUpdateRequest,
)


def _tr(key: str, default: str) -> str:
    return t("admin_menu", key, default=default)


class AdminMenuService(BaseService):
    def __init__(self) -> None:
        settings = get_settings()
        super().__init__(settings)
        self.repo = AdminMenuRepository()

    async def get_menu(self, *, user_id: UUID) -> AdminMenuTreeOut:
        provider = get_authz_snapshot_provider()
        if provider is None:
            raise ServiceUnavailable(
                message=t("errors", "AUTHZ_ENGINE_UNAVAILABLE", default="鉴权引擎不可用"),
                error="AUTHZ_ENGINE_UNAVAILABLE",
            )
        snap = await provider.get_snapshot(user_id)
        permission_set = set(snap.get("permission_codes") or [])
        is_superuser = bool(snap.get("is_superuser", False))

        rows = await self.repo.query_items_for_user().all().order_by("sort", "created_at")
        by_id = {row.id: row for row in rows}
        children: dict[UUID | None, list[AdminMenuItem]] = {}
        for row in rows:
            children.setdefault(row.parent_id, []).append(row)

        for items in children.values():
            items.sort(key=lambda r: (r.sort, r.created_at, str(r.id)))

        visible: set[UUID] = set()

        def _allowed(item: AdminMenuItem) -> bool:
            if is_superuser:
                return True
            if not item.permission_code:
                # Per your rule 4a: null permission means "admin:access is enough".
                return True
            return item.permission_code in permission_set

        def _compute_visible(item_id: UUID) -> bool:
            item = by_id.get(item_id)
            if item is None:
                return False
            allowed = _allowed(item)
            if item.type == AdminMenuItemType.GROUP:
                # Group can be visible if any child is visible.
                for child in children.get(item.id, []):
                    if _compute_visible(child.id):
                        allowed = True
                        break
            if allowed:
                visible.add(item.id)
            return allowed

        roots = children.get(None, [])
        for row in roots:
            _compute_visible(row.id)

        def _build_node(item: AdminMenuItem) -> AdminMenuNode | None:
            if item.id not in visible:
                return None
            node = AdminMenuNode(
                id=item.id,
                code=item.code,
                title=item.title,
                title_i18n=item.title_i18n,
                icon=item.icon,
                path=item.path,
                name=item.name,
                component_key=item.component_key,
                redirect=item.redirect,
                sort=item.sort,
                meta=item.meta if isinstance(item.meta, dict) else None,
                children=[],
            )
            for child in children.get(item.id, []):
                built = _build_node(child)
                if built is not None:
                    node.children.append(built)
            return node

        tree: list[AdminMenuNode] = []
        for row in roots:
            built = _build_node(row)
            if built is not None:
                tree.append(built)
        return AdminMenuTreeOut(items=tree)

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
        if ordering:
            qs = qs.order_by(*normalize_ordering(ordering))
        else:
            qs = qs.order_by("sort", "created_at")

        return await paginate_queryset(qs, params=params, out_schema=AdminMenuItemOut)

    async def get_item(self, *, item_id: UUID) -> AdminMenuItemOut:
        item = await self.repo.get_by_id(item_id=item_id, include_deleted=True)
        if item is None:
            raise NotFound(message=_tr("ITEM_NOT_FOUND", "菜单项不存在"), error="ITEM_NOT_FOUND")
        return AdminMenuItemOut.model_validate(item, from_attributes=True)

    async def create_item(self, *, payload: AdminMenuCreateRequest) -> AdminMenuItemOut:
        code = payload.code.strip()
        if await self.repo.get_by_code(code=code) is not None:
            raise Conflict(message=_tr("ITEM_CODE_EXISTS", "菜单编码已存在"), error="ITEM_CODE_EXISTS")

        parent_id = payload.parent_id
        if parent_id is not None:
            parent = await self.repo.get_by_id(item_id=parent_id, include_deleted=False)
            if parent is None:
                raise BadRequest(message=_tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")

        item_type = str(payload.type).strip().lower()
        if item_type not in {"group", "item"}:
            raise BadRequest(message="type 不合法", error="BAD_REQUEST")

        path = payload.path.strip() if payload.path else None
        name = payload.name.strip() if payload.name else None
        if item_type == "item":
            if not path or not path.startswith("/"):
                raise BadRequest(message="path 不合法", error="BAD_REQUEST")
            if not name:
                raise BadRequest(message="name 不合法", error="BAD_REQUEST")

        item = await self.repo.create_item(
            payload={
                "code": code,
                "parent_id": parent_id,
                "title": payload.title,
                "title_i18n": payload.title_i18n,
                "icon": payload.icon,
                "type": AdminMenuItemType(item_type),
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

    async def update_item(self, *, item_id: UUID, payload: AdminMenuUpdateRequest) -> AdminMenuItemOut:
        item = await self.repo.get_by_id(item_id=item_id, include_deleted=True)
        if item is None:
            raise NotFound(message=_tr("ITEM_NOT_FOUND", "菜单项不存在"), error="ITEM_NOT_FOUND")

        updates = payload.model_dump(exclude_unset=True)
        # Enforce immutable code.
        updates.pop("code", None)

        if "parent_id" in updates:
            new_parent_id = updates.get("parent_id")
            if new_parent_id == item.id:
                raise BadRequest(message=_tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")
            if new_parent_id is not None:
                parent = await self.repo.get_by_id(item_id=new_parent_id, include_deleted=False)
                if parent is None:
                    raise BadRequest(message=_tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")
                if await self._is_descendant(candidate_id=new_parent_id, ancestor_id=item.id):
                    raise BadRequest(message=_tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")

        if "type" in updates and updates["type"] is not None:
            raw = str(updates["type"]).strip().lower()
            if raw not in {"group", "item"}:
                raise BadRequest(message="type 不合法", error="BAD_REQUEST")
            updates["type"] = AdminMenuItemType(raw)

        if "path" in updates and updates["path"] is not None:
            updates["path"] = updates["path"].strip()
        if "name" in updates and updates["name"] is not None:
            updates["name"] = updates["name"].strip()

        # Basic validation for item routes.
        next_type = updates.get("type", item.type)
        next_path = updates.get("path", item.path)
        next_name = updates.get("name", item.name)
        if next_type == AdminMenuItemType.ITEM:
            if not next_path or not str(next_path).startswith("/"):
                raise BadRequest(message="path 不合法", error="BAD_REQUEST")
            if not next_name:
                raise BadRequest(message="name 不合法", error="BAD_REQUEST")

        item = await self.repo.save_updates(item, updates=updates)
        return AdminMenuItemOut.model_validate(item, from_attributes=True)

    async def delete_item(self, *, item_id: UUID) -> None:
        item = await self.repo.get_by_id(item_id=item_id, include_deleted=False)
        if item is None:
            raise NotFound(message=_tr("ITEM_NOT_FOUND", "菜单项不存在"), error="ITEM_NOT_FOUND")
        if await self.repo.has_children(item_id=item_id):
            raise BadRequest(message=_tr("ITEM_HAS_CHILDREN", "菜单项下存在子项，无法删除"), error="ITEM_HAS_CHILDREN")
        await self.repo.soft_delete(item)

    async def restore_item(self, *, item_id: UUID) -> AdminMenuItemOut:
        item = await self.repo.get_by_id(item_id=item_id, include_deleted=True)
        if item is None:
            raise NotFound(message=_tr("ITEM_NOT_FOUND", "菜单项不存在"), error="ITEM_NOT_FOUND")
        if item.deleted_at is None:
            return AdminMenuItemOut.model_validate(item, from_attributes=True)
        if item.parent_id is not None:
            parent = await self.repo.get_by_id(item_id=item.parent_id, include_deleted=False)
            if parent is None:
                raise BadRequest(message=_tr("INVALID_PARENT", "父菜单不合法"), error="INVALID_PARENT")
        item = await self.repo.restore(item)
        return AdminMenuItemOut.model_validate(item, from_attributes=True)

    async def reorder(self, *, payload: AdminMenuReorderRequest) -> None:
        rows = await AdminMenuItem.filter(id__in=payload.ordered_ids, deleted_at__isnull=True).all()
        found = {r.id for r in rows}
        missing = [str(mid) for mid in payload.ordered_ids if mid not in found]
        if missing:
            raise NotFound(
                message=_tr("ITEM_NOT_FOUND", "菜单项不存在"), error="ITEM_NOT_FOUND", details={"missing": missing}
            )

        parent_ids = {r.parent_id for r in rows}
        if len(parent_ids) != 1 or next(iter(parent_ids)) != payload.parent_id:
            raise BadRequest(message="parentId 不一致", error="BAD_REQUEST")

        for idx, mid in enumerate(payload.ordered_ids):
            await AdminMenuItem.filter(id=mid).update(sort=idx * 10)

    async def _is_descendant(self, *, candidate_id: UUID, ancestor_id: UUID) -> bool:
        # Walk parent chain (menu depth should be small).
        current = await AdminMenuItem.get_or_none(id=candidate_id)
        seen: set[UUID] = set()
        while current is not None and current.parent_id is not None:
            if current.parent_id == ancestor_id:
                return True
            if current.parent_id in seen:
                return True
            seen.add(current.parent_id)
            current = await AdminMenuItem.get_or_none(id=current.parent_id)
        return False
