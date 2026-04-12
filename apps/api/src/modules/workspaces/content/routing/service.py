from __future__ import annotations

from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.core.exceptions import Conflict, NotFound
from src.models.content.content_item import ContentItemRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.route_binding import RouteBindingRecord
from src.modules.sites.shared.service import normalize_path
from src.modules.workspaces.content.items.domain_helpers import item_has_capability
from src.modules.workspaces.content.routing.schema import (
    HierarchyNodeOut,
    HierarchyNodeUpsertIn,
    RouteBindingOut,
    RouteBindingUpsertIn,
)


def _normalize_route_path(path: str) -> str:
    pathname = normalize_path(path)
    if "?" in pathname or "#" in pathname or "\\" in pathname:
        raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
    if "//" in pathname:
        raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
    return pathname


def _to_route_binding_out(record: RouteBindingRecord) -> RouteBindingOut:
    return RouteBindingOut(
        id=record.id,
        workspace_id=record.workspace_id,
        site_id=record.site_id,
        item_id=record.item_id,
        locale=record.locale,
        path=record.path,
        is_active=record.is_active,
    )


def _to_hierarchy_node_out(record: HierarchyNodeRecord) -> HierarchyNodeOut:
    return HierarchyNodeOut(
        id=record.id,
        workspace_id=record.workspace_id,
        site_id=record.site_id,
        item_id=record.item_id,
        parent_item_id=record.parent_item_id,
        sort_order=record.sort_order,
    )


async def _get_item_with_model(*, workspace_id: UUID, site_id: UUID, item_id: UUID) -> ContentItemRecord:
    item = (
        await ContentItemRecord
        .filter(
            workspace_id=workspace_id,
            site_id=site_id,
            id=item_id,
        )
        .prefetch_related("model_definition")
        .first()
    )
    if item is None:
        raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
    return item


async def _ensure_no_hierarchy_cycle(*, site_id: UUID, item_id: UUID, parent_item_id: UUID | None) -> None:
    if parent_item_id is None:
        return
    if parent_item_id == item_id:
        raise Conflict("Parent cycle detected", error="CONTENT_HIERARCHY_CYCLE")

    cursor = parent_item_id
    while cursor is not None:
        if cursor == item_id:
            raise Conflict("Parent cycle detected", error="CONTENT_HIERARCHY_CYCLE")
        node = await HierarchyNodeRecord.get_or_none(site_id=site_id, item_id=cursor)
        cursor = node.parent_item_id if node is not None else None


class WorkspaceContentRoutingService:
    async def list_route_bindings(self, *, workspace_id: UUID, site_id: UUID) -> list[RouteBindingOut]:
        rows = await RouteBindingRecord.filter(workspace_id=workspace_id, site_id=site_id).order_by("locale", "path")
        return [_to_route_binding_out(row) for row in rows]

    async def upsert_route_binding(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        payload: RouteBindingUpsertIn,
    ) -> RouteBindingOut:
        item = await _get_item_with_model(workspace_id=workspace_id, site_id=site_id, item_id=item_id)
        if not item_has_capability(item, "routable"):
            raise Conflict("Content item is not routable", error="CONTENT_ITEM_NOT_ROUTABLE")

        locale = payload.locale.strip() or "zh-CN"
        path = _normalize_route_path(payload.path)
        async with in_transaction() as conn:
            record = (
                await RouteBindingRecord
                .filter(site_id=site_id, item_id=item_id, locale=locale)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if record is None:
                try:
                    record = await RouteBindingRecord.create(
                        workspace_id=workspace_id,
                        site_id=site_id,
                        item_id=item_id,
                        locale=locale,
                        path=path,
                        is_active=payload.is_active,
                        using_db=conn,
                    )
                except IntegrityError as exc:
                    raise Conflict("Content route conflict", error="CONTENT_ROUTE_CONFLICT") from exc
            else:
                record.path = path
                record.is_active = payload.is_active
                try:
                    await record.save(update_fields=["path", "is_active"], using_db=conn)
                except IntegrityError as exc:
                    raise Conflict("Content route conflict", error="CONTENT_ROUTE_CONFLICT") from exc
        return _to_route_binding_out(record)

    async def list_hierarchy_nodes(self, *, workspace_id: UUID, site_id: UUID) -> list[HierarchyNodeOut]:
        rows = await HierarchyNodeRecord.filter(workspace_id=workspace_id, site_id=site_id).order_by("sort_order", "id")
        return [_to_hierarchy_node_out(row) for row in rows]

    async def upsert_hierarchy_node(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        payload: HierarchyNodeUpsertIn,
    ) -> HierarchyNodeOut:
        item = await _get_item_with_model(workspace_id=workspace_id, site_id=site_id, item_id=item_id)
        if not item_has_capability(item, "treeable"):
            raise Conflict("Content item is not treeable", error="CONTENT_ITEM_NOT_TREEABLE")

        parent_item_id = payload.parent_item_id
        if parent_item_id is not None:
            await _get_item_with_model(workspace_id=workspace_id, site_id=site_id, item_id=parent_item_id)
            await _ensure_no_hierarchy_cycle(site_id=site_id, item_id=item_id, parent_item_id=parent_item_id)

        async with in_transaction() as conn:
            record = (
                await HierarchyNodeRecord
                .filter(site_id=site_id, item_id=item_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if record is None:
                record = await HierarchyNodeRecord.create(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=item_id,
                    parent_item_id=parent_item_id,
                    sort_order=payload.sort_order,
                    using_db=conn,
                )
            else:
                record.parent_item_id = parent_item_id
                record.sort_order = payload.sort_order
                await record.save(update_fields=["parent_item_id", "sort_order"], using_db=conn)
        return _to_hierarchy_node_out(record)
