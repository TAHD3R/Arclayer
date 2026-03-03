from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
from uuid import UUID, uuid4

from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.core.http.pagination import PageData, PageParams
from apps.api.src.modules.sites.schema import (
    SiteRouteTemplateCreateIn as ContentRouteCreateIn,
)
from apps.api.src.modules.sites.schema import (
    SiteRouteTemplateDeleteOut as ContentRouteDeleteOut,
)
from apps.api.src.modules.sites.schema import (
    SiteRouteTemplateOut as ContentRouteOut,
)
from apps.api.src.modules.sites.schema import (
    SiteRouteTemplateUpdateIn as ContentRouteUpdateIn,
)
from apps.api.src.modules.workspaces.content.constants import (
    CONTENT_GLOBAL_SLOTS_NAMESPACE,
    CONTENT_MENUS_NAMESPACE,
)
from apps.api.src.modules.workspaces.content.schema import (
    ContentGlobalSlotOut,
    ContentGlobalSlotsOut,
    ContentGlobalSlotUpsertIn,
    ContentMenuCreateIn,
    ContentMenuDeleteOut,
    ContentMenuItemCreateIn,
    ContentMenuItemDeleteOut,
    ContentMenuItemKind,
    ContentMenuItemOut,
    ContentMenuItemsReorderIn,
    ContentMenuItemUpdateIn,
    ContentMenuOut,
    ContentMenuUpdateIn,
)


class WorkspaceContentStructureMixin:
    if TYPE_CHECKING:
        from apps.api.src.modules.sites.service import SiteService
        from apps.api.src.modules.workspaces.content.repository import WorkspaceContentRepository

        repo: WorkspaceContentRepository
        site_service: SiteService

        @staticmethod
        def _now_ms() -> int: ...

        @staticmethod
        def _validate_type_code(code: str) -> str: ...

        @staticmethod
        def _parse_uuid_value(value: Any) -> UUID | None: ...

        async def _ensure_site_entry_type(self, *, workspace_id: UUID, site_id: UUID, type_code: str) -> str: ...

        async def _get_setting_value(self, *, site_id: UUID, namespace: str) -> dict[str, Any] | None: ...

        async def _put_setting_value(
            self,
            *,
            site_id: UUID,
            namespace: str,
            value: dict[str, Any] | None,
        ) -> None: ...

        async def _get_setting_list(self, *, site_id: UUID, namespace: str) -> list[dict[str, Any]]: ...

        async def _put_setting_list(
            self,
            *,
            site_id: UUID,
            namespace: str,
            items: list[dict[str, Any]],
        ) -> None: ...

    def _menu_item_from_raw(self, raw: dict[str, Any]) -> ContentMenuItemOut:
        item_id = self._parse_uuid_value(raw.get("id"))
        if item_id is None:
            raise ValueError("Invalid menu item id")

        children_raw = raw.get("children")
        children: list[ContentMenuItemOut] = []
        if isinstance(children_raw, list):
            for child in children_raw:
                if not isinstance(child, dict):
                    continue
                try:
                    children.append(self._menu_item_from_raw(child))
                except ValueError:
                    continue

        parent_id = self._parse_uuid_value(raw.get("parentId"))

        kind_raw = raw.get("kind")
        kind: ContentMenuItemKind = "link"
        if isinstance(kind_raw, str) and kind_raw in ("link", "page", "entry", "custom"):
            kind = cast(ContentMenuItemKind, kind_raw)

        return ContentMenuItemOut(
            id=item_id,
            label=str(raw.get("label") or ""),
            kind=kind,
            target=(str(raw.get("target")) if raw.get("target") is not None else None),
            parent_id=parent_id,
            sort_order=int(raw.get("sortOrder") or 0),
            meta=(raw.get("meta") if isinstance(raw.get("meta"), dict) else None),
            children=children,
        )

    def _menu_from_raw(self, raw: dict[str, Any]) -> ContentMenuOut:
        menu_id = self._parse_uuid_value(raw.get("id"))
        if menu_id is None:
            raise ValueError("Invalid menu id")

        items_raw = raw.get("items")
        items: list[ContentMenuItemOut] = []
        if isinstance(items_raw, list):
            for item in items_raw:
                if not isinstance(item, dict):
                    continue
                try:
                    items.append(self._menu_item_from_raw(item))
                except ValueError:
                    continue

        return ContentMenuOut(
            id=menu_id,
            key=str(raw.get("key") or ""),
            name=str(raw.get("name") or ""),
            items=items,
            updated_at_ms=int(raw.get("updatedAtMs") or 0),
        )

    @staticmethod
    def _menu_item_to_raw(item: ContentMenuItemOut) -> dict[str, Any]:
        return {
            "id": str(item.id),
            "label": item.label,
            "kind": item.kind,
            "target": item.target,
            "parentId": (str(item.parent_id) if item.parent_id is not None else None),
            "sortOrder": item.sort_order,
            "meta": item.meta,
            "children": [WorkspaceContentStructureMixin._menu_item_to_raw(child) for child in item.children],
        }

    @staticmethod
    def _menu_to_raw(menu: ContentMenuOut) -> dict[str, Any]:
        return {
            "id": str(menu.id),
            "key": menu.key,
            "name": menu.name,
            "updatedAtMs": menu.updated_at_ms,
            "items": [WorkspaceContentStructureMixin._menu_item_to_raw(item) for item in menu.items],
        }

    @staticmethod
    def _walk_menu_items(items: list[ContentMenuItemOut]) -> list[ContentMenuItemOut]:
        out: list[ContentMenuItemOut] = []
        stack = list(items)
        while stack:
            node = stack.pop()
            out.append(node)
            if node.children:
                stack.extend(node.children)
        return out

    @staticmethod
    def _build_menu_tree_from_flat(items: list[ContentMenuItemOut]) -> list[ContentMenuItemOut]:
        by_id: dict[UUID, ContentMenuItemOut] = {item.id: item.model_copy(update={"children": []}) for item in items}
        roots: list[ContentMenuItemOut] = []
        for item in by_id.values():
            if item.parent_id and item.parent_id in by_id:
                parent = by_id[item.parent_id]
                parent.children.append(item)
            else:
                roots.append(item)

        def _sort_nodes(nodes: list[ContentMenuItemOut]) -> None:
            nodes.sort(key=lambda x: (x.sort_order, x.label, x.id))
            for node in nodes:
                if node.children:
                    _sort_nodes(node.children)

        _sort_nodes(roots)
        return roots

    async def list_routes_paginated(self, *, site_id: UUID, params: PageParams) -> PageData[ContentRouteOut]:
        return await self.site_service.list_route_templates_paginated(site_id=site_id, params=params)

    async def create_route(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        payload: ContentRouteCreateIn,
    ) -> ContentRouteOut:
        entry_type_code = await self._ensure_site_entry_type(
            workspace_id=workspace_id,
            site_id=site_id,
            type_code=payload.entry_type_code,
        )
        route_payload = payload.model_copy(update={"entry_type_code": entry_type_code})
        return await self.site_service.create_route_template(site_id=site_id, payload=route_payload)

    async def update_route(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        route_id: UUID,
        payload: ContentRouteUpdateIn,
    ) -> ContentRouteOut:
        route_payload = payload
        if payload.entry_type_code is not None:
            entry_type_code = await self._ensure_site_entry_type(
                workspace_id=workspace_id,
                site_id=site_id,
                type_code=payload.entry_type_code,
            )
            route_payload = payload.model_copy(update={"entry_type_code": entry_type_code})
        return await self.site_service.update_route_template(
            site_id=site_id, template_id=route_id, payload=route_payload
        )

    async def delete_route(self, *, site_id: UUID, route_id: UUID) -> ContentRouteDeleteOut:
        return await self.site_service.delete_route_template(site_id=site_id, template_id=route_id)

    async def list_global_slots(self, *, site_id: UUID) -> ContentGlobalSlotsOut:
        value = await self._get_setting_value(site_id=site_id, namespace=CONTENT_GLOBAL_SLOTS_NAMESPACE) or {}
        items: list[ContentGlobalSlotOut] = []
        for slot_key, slot_value in value.items():
            if not isinstance(slot_value, dict):
                continue
            items.append(
                ContentGlobalSlotOut(
                    slot_key=str(slot_key),
                    value=(slot_value.get("value") if isinstance(slot_value.get("value"), dict) else None),
                    updated_at_ms=int(slot_value.get("updatedAtMs") or 0),
                )
            )
        items.sort(key=lambda row: row.slot_key)
        return ContentGlobalSlotsOut(items=items)

    async def upsert_global_slot(
        self,
        *,
        site_id: UUID,
        slot_key: str,
        payload: ContentGlobalSlotUpsertIn,
    ) -> ContentGlobalSlotOut:
        key = (slot_key or "").strip()
        if not key:
            raise Conflict("Invalid slot key", error="CONTENT_GLOBAL_SLOT_KEY_INVALID")

        value = await self._get_setting_value(site_id=site_id, namespace=CONTENT_GLOBAL_SLOTS_NAMESPACE) or {}
        value[key] = {
            "value": payload.value,
            "updatedAtMs": self._now_ms(),
        }
        await self._put_setting_value(site_id=site_id, namespace=CONTENT_GLOBAL_SLOTS_NAMESPACE, value=value)
        slot = value[key]
        return ContentGlobalSlotOut(
            slot_key=key,
            value=(slot.get("value") if isinstance(slot.get("value"), dict) else None),
            updated_at_ms=int(slot.get("updatedAtMs") or 0),
        )

    async def list_menus(self, *, site_id: UUID) -> list[ContentMenuOut]:
        raw = await self._get_setting_list(site_id=site_id, namespace=CONTENT_MENUS_NAMESPACE)
        rows: list[ContentMenuOut] = []
        for item in raw:
            try:
                rows.append(self._menu_from_raw(item))
            except ValueError:
                continue
        rows.sort(key=lambda row: (row.key, row.name, row.id))
        return rows

    async def create_menu(self, *, site_id: UUID, payload: ContentMenuCreateIn) -> ContentMenuOut:
        rows = await self.list_menus(site_id=site_id)
        key = (payload.key or "").strip()
        name = (payload.name or "").strip()
        if not key:
            raise Conflict("Invalid menu key", error="CONTENT_MENU_KEY_INVALID")
        if not name:
            raise Conflict("Invalid menu name", error="CONTENT_MENU_NAME_INVALID")
        if any(row.key == key for row in rows):
            raise Conflict("Menu key already exists", error="CONTENT_MENU_KEY_CONFLICT")

        menu = ContentMenuOut(
            id=uuid4(),
            key=key,
            name=name,
            items=[],
            updated_at_ms=self._now_ms(),
        )
        rows.append(menu)
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_MENUS_NAMESPACE,
            items=[self._menu_to_raw(row) for row in rows],
        )
        return menu

    async def update_menu(self, *, site_id: UUID, menu_id: UUID, payload: ContentMenuUpdateIn) -> ContentMenuOut:
        rows = await self.list_menus(site_id=site_id)
        idx = next((i for i, row in enumerate(rows) if row.id == menu_id), None)
        if idx is None:
            raise NotFound("Menu not found", error="CONTENT_MENU_NOT_FOUND")

        current = rows[idx]
        new_key = current.key
        new_name = current.name
        if "key" in payload.model_fields_set and payload.key is not None:
            new_key = payload.key.strip()
            if not new_key:
                raise Conflict("Invalid menu key", error="CONTENT_MENU_KEY_INVALID")
            if any(row.id != current.id and row.key == new_key for row in rows):
                raise Conflict("Menu key already exists", error="CONTENT_MENU_KEY_CONFLICT")
        if "name" in payload.model_fields_set and payload.name is not None:
            new_name = payload.name.strip()
            if not new_name:
                raise Conflict("Invalid menu name", error="CONTENT_MENU_NAME_INVALID")

        updated = current.model_copy(update={"key": new_key, "name": new_name, "updated_at_ms": self._now_ms()})
        rows[idx] = updated
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_MENUS_NAMESPACE,
            items=[self._menu_to_raw(row) for row in rows],
        )
        return updated

    async def delete_menu(self, *, site_id: UUID, menu_id: UUID) -> ContentMenuDeleteOut:
        rows = await self.list_menus(site_id=site_id)
        next_rows = [row for row in rows if row.id != menu_id]
        if len(next_rows) == len(rows):
            raise NotFound("Menu not found", error="CONTENT_MENU_NOT_FOUND")
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_MENUS_NAMESPACE,
            items=[self._menu_to_raw(row) for row in next_rows],
        )
        return ContentMenuDeleteOut(menu_id=menu_id)

    async def create_menu_item(
        self,
        *,
        site_id: UUID,
        menu_id: UUID,
        payload: ContentMenuItemCreateIn,
    ) -> ContentMenuOut:
        rows = await self.list_menus(site_id=site_id)
        idx = next((i for i, row in enumerate(rows) if row.id == menu_id), None)
        if idx is None:
            raise NotFound("Menu not found", error="CONTENT_MENU_NOT_FOUND")

        menu = rows[idx]
        flat = self._walk_menu_items(menu.items)
        if payload.parent_id is not None and all(item.id != payload.parent_id for item in flat):
            raise NotFound("Parent menu item not found", error="CONTENT_MENU_ITEM_PARENT_NOT_FOUND")

        item = ContentMenuItemOut(
            id=uuid4(),
            label=(payload.label or "").strip(),
            kind=payload.kind,
            target=(payload.target.strip() if isinstance(payload.target, str) and payload.target.strip() else None),
            parent_id=payload.parent_id,
            sort_order=payload.sort_order,
            meta=payload.meta,
            children=[],
        )
        if not item.label:
            raise Conflict("Invalid menu item label", error="CONTENT_MENU_ITEM_LABEL_INVALID")

        flat.append(item)
        tree = self._build_menu_tree_from_flat(flat)
        updated_menu = menu.model_copy(update={"items": tree, "updated_at_ms": self._now_ms()})
        rows[idx] = updated_menu

        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_MENUS_NAMESPACE,
            items=[self._menu_to_raw(row) for row in rows],
        )
        return updated_menu

    async def update_menu_item(
        self,
        *,
        site_id: UUID,
        menu_id: UUID,
        item_id: UUID,
        payload: ContentMenuItemUpdateIn,
    ) -> ContentMenuOut:
        rows = await self.list_menus(site_id=site_id)
        idx = next((i for i, row in enumerate(rows) if row.id == menu_id), None)
        if idx is None:
            raise NotFound("Menu not found", error="CONTENT_MENU_NOT_FOUND")

        menu = rows[idx]
        flat = self._walk_menu_items(menu.items)
        item_idx = next((i for i, item in enumerate(flat) if item.id == item_id), None)
        if item_idx is None:
            raise NotFound("Menu item not found", error="CONTENT_MENU_ITEM_NOT_FOUND")

        current = flat[item_idx]
        updates: dict[str, Any] = {}
        if "label" in payload.model_fields_set and payload.label is not None:
            label = payload.label.strip()
            if not label:
                raise Conflict("Invalid menu item label", error="CONTENT_MENU_ITEM_LABEL_INVALID")
            updates["label"] = label
        if "kind" in payload.model_fields_set and payload.kind is not None:
            updates["kind"] = payload.kind
        if "target" in payload.model_fields_set:
            if payload.target is None:
                updates["target"] = None
            else:
                target = payload.target.strip()
                updates["target"] = target or None
        if "parent_id" in payload.model_fields_set:
            if payload.parent_id == item_id:
                raise Conflict("Menu item parent invalid", error="CONTENT_MENU_ITEM_PARENT_INVALID")
            if payload.parent_id is not None and all(item.id != payload.parent_id for item in flat):
                raise NotFound("Parent menu item not found", error="CONTENT_MENU_ITEM_PARENT_NOT_FOUND")
            updates["parent_id"] = payload.parent_id
        if "sort_order" in payload.model_fields_set and payload.sort_order is not None:
            updates["sort_order"] = payload.sort_order
        if "meta" in payload.model_fields_set:
            updates["meta"] = payload.meta

        flat[item_idx] = current.model_copy(update=updates)
        tree = self._build_menu_tree_from_flat(flat)
        updated_menu = menu.model_copy(update={"items": tree, "updated_at_ms": self._now_ms()})
        rows[idx] = updated_menu
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_MENUS_NAMESPACE,
            items=[self._menu_to_raw(row) for row in rows],
        )
        return updated_menu

    async def delete_menu_item(
        self,
        *,
        site_id: UUID,
        menu_id: UUID,
        item_id: UUID,
    ) -> ContentMenuItemDeleteOut:
        rows = await self.list_menus(site_id=site_id)
        idx = next((i for i, row in enumerate(rows) if row.id == menu_id), None)
        if idx is None:
            raise NotFound("Menu not found", error="CONTENT_MENU_NOT_FOUND")

        menu = rows[idx]
        flat = self._walk_menu_items(menu.items)
        if all(item.id != item_id for item in flat):
            raise NotFound("Menu item not found", error="CONTENT_MENU_ITEM_NOT_FOUND")

        to_remove = {item_id}
        changed = True
        while changed:
            changed = False
            for item in flat:
                if item.parent_id in to_remove and item.id not in to_remove:
                    to_remove.add(item.id)
                    changed = True

        next_flat = [item for item in flat if item.id not in to_remove]
        tree = self._build_menu_tree_from_flat(next_flat)
        updated_menu = menu.model_copy(update={"items": tree, "updated_at_ms": self._now_ms()})
        rows[idx] = updated_menu
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_MENUS_NAMESPACE,
            items=[self._menu_to_raw(row) for row in rows],
        )
        return ContentMenuItemDeleteOut(item_id=item_id)

    async def reorder_menu_items(
        self,
        *,
        site_id: UUID,
        menu_id: UUID,
        payload: ContentMenuItemsReorderIn,
    ) -> ContentMenuOut:
        rows = await self.list_menus(site_id=site_id)
        idx = next((i for i, row in enumerate(rows) if row.id == menu_id), None)
        if idx is None:
            raise NotFound("Menu not found", error="CONTENT_MENU_NOT_FOUND")
        menu = rows[idx]
        existing = self._walk_menu_items(menu.items)
        by_id = {item.id: item for item in existing}
        existing_ids = set(by_id.keys())

        def _assign(
            nodes: list[dict[str, Any]],
            *,
            parent_id: UUID | None,
            out: list[ContentMenuItemOut],
        ) -> None:
            for order, node in enumerate(nodes):
                item_id = self._parse_uuid_value(node.get("id"))
                if item_id is None:
                    raise NotFound("Menu item not found", error="CONTENT_MENU_ITEM_NOT_FOUND")
                if item_id not in by_id:
                    raise NotFound("Menu item not found", error="CONTENT_MENU_ITEM_NOT_FOUND")
                base = by_id[item_id]
                out.append(base.model_copy(update={"parent_id": parent_id, "sort_order": order}))
                children = node.get("children")
                if isinstance(children, list):
                    _assign(children, parent_id=item_id, out=out)

        order_nodes = [node.model_dump(by_alias=True) for node in payload.items]
        rebuilt: list[ContentMenuItemOut] = []
        _assign(order_nodes, parent_id=None, out=rebuilt)
        if {item.id for item in rebuilt} != existing_ids:
            raise Conflict("Reorder payload mismatch", error="CONTENT_MENU_ITEMS_REORDER_MISMATCH")

        tree = self._build_menu_tree_from_flat(rebuilt)
        updated_menu = menu.model_copy(update={"items": tree, "updated_at_ms": self._now_ms()})
        rows[idx] = updated_menu
        await self._put_setting_list(
            site_id=site_id,
            namespace=CONTENT_MENUS_NAMESPACE,
            items=[self._menu_to_raw(row) for row in rows],
        )
        return updated_menu
