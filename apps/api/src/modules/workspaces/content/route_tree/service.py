from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.models.content.content import ContentEntryRecord
from apps.api.src.models.content.route import ContentRouteRecord
from apps.api.src.models.content.tree import ContentTreeNodeRecord
from apps.api.src.modules.sites.shared.service import normalize_path
from apps.api.src.modules.workspaces.content.route_tree.schema import (
    ContentRouteCreateIn,
    ContentRouteDeleteOut,
    ContentRouteOut,
    ContentRouteUpdateIn,
    ContentTreeNodeDeleteOut,
    ContentTreeNodeOut,
    ContentTreeNodeUpsertIn,
)

if TYPE_CHECKING:
    from apps.api.src.modules.workspaces.content.repository import WorkspaceContentRepository


def validate_content_route_pathname(path: str) -> str:
    pathname = normalize_path(path)
    if "?" in pathname or "#" in pathname:
        raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
    if "\\" in pathname:
        raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in pathname):
        raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
    if pathname == "/":
        return "/"
    if "//" in pathname:
        raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
    segments = pathname.split("/")[1:]
    for seg in segments:
        if not seg:
            raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
        if seg in (".", ".."):
            raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
    return pathname


def to_content_route_out(record: ContentRouteRecord) -> ContentRouteOut:
    return ContentRouteOut(
        id=UUID(str(record.id)),
        workspace_id=UUID(str(record.workspace_id)),
        site_id=UUID(str(record.site_id)),
        entry_id=UUID(str(record.entry_id)),
        locale=str(record.locale),
        path=str(record.path),
        is_active=bool(record.is_active),
    )


def to_content_tree_node_out(record: ContentTreeNodeRecord) -> ContentTreeNodeOut:
    parent_raw = getattr(record, "parent_entry_id", None)
    parent_entry_id = UUID(str(parent_raw)) if parent_raw is not None else None
    return ContentTreeNodeOut(
        id=UUID(str(record.id)),
        workspace_id=UUID(str(record.workspace_id)),
        site_id=UUID(str(record.site_id)),
        entry_id=UUID(str(record.entry_id)),
        parent_entry_id=parent_entry_id,
        sort_order=int(getattr(record, "sort_order", 0) or 0),
    )


async def assert_no_tree_parent_cycle(*, site_id: UUID, entry_id: UUID, parent_entry_id: UUID | None) -> None:
    if parent_entry_id is None:
        return
    if parent_entry_id == entry_id:
        raise Conflict("Invalid parent entry id", error="CONTENT_TREE_PARENT_INVALID")

    cursor_id: UUID | None = parent_entry_id
    while cursor_id is not None:
        if cursor_id == entry_id:
            raise Conflict("Parent cycle detected", error="CONTENT_TREE_PARENT_CYCLE")
        node = await ContentTreeNodeRecord.get_or_none(site_id=site_id, entry_id=cursor_id)
        if node is None:
            return
        raw_next_parent = getattr(node, "parent_entry_id", None)
        cursor_id = UUID(str(raw_next_parent)) if raw_next_parent is not None else None


class WorkspaceContentRouteTreeMixin:
    if TYPE_CHECKING:
        repo: WorkspaceContentRepository

    async def list_route_bindings_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
        entry_id: UUID | None = None,
        locale: str | None = None,
        is_active: bool | None = None,
    ) -> PageData[ContentRouteOut]:
        qs = ContentRouteRecord.filter(workspace_id=workspace_id, site_id=site_id)
        if entry_id is not None:
            qs = qs.filter(entry_id=entry_id)
        if locale is not None:
            qs = qs.filter(locale=str(locale))
        if is_active is not None:
            qs = qs.filter(is_active=bool(is_active))
        rows = await qs.order_by("locale", "path", "id").all()
        out = [to_content_route_out(record) for record in rows]
        return paginate_items(out, params=params)

    async def create_route_binding(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        payload: ContentRouteCreateIn,
    ) -> ContentRouteOut:
        entry = await ContentEntryRecord.get_or_none(
            id=payload.entry_id,
            workspace_id=workspace_id,
            site_id=site_id,
        )
        if entry is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")

        locale = (payload.locale or "").strip() or "zh-CN"
        path = validate_content_route_pathname(payload.path)
        try:
            record = await ContentRouteRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=UUID(str(entry.id)),
                locale=locale,
                path=path,
                is_active=bool(payload.is_active),
            )
        except IntegrityError:
            raise Conflict("Content route conflict", error="CONTENT_ROUTE_CONFLICT") from None
        return to_content_route_out(record)

    async def update_route_binding(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        route_id: UUID,
        payload: ContentRouteUpdateIn,
    ) -> ContentRouteOut:
        async with in_transaction() as conn:
            record = (
                await ContentRouteRecord
                .filter(id=route_id, workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if record is None:
                raise NotFound("Content route not found", error="CONTENT_ROUTE_NOT_FOUND")

            update_fields: list[str] = []
            if "locale" in payload.model_fields_set and payload.locale is not None:
                record.locale = (payload.locale or "").strip() or "zh-CN"
                update_fields.append("locale")
            if "path" in payload.model_fields_set and payload.path is not None:
                record.path = validate_content_route_pathname(payload.path)
                update_fields.append("path")
            if "is_active" in payload.model_fields_set and payload.is_active is not None:
                record.is_active = bool(payload.is_active)
                update_fields.append("is_active")

            if update_fields:
                try:
                    await record.save(update_fields=update_fields, using_db=conn)
                except IntegrityError:
                    raise Conflict("Content route conflict", error="CONTENT_ROUTE_CONFLICT") from None

        refreshed = await ContentRouteRecord.get_or_none(id=route_id, workspace_id=workspace_id, site_id=site_id)
        if refreshed is None:
            raise NotFound("Content route not found", error="CONTENT_ROUTE_NOT_FOUND")
        return to_content_route_out(refreshed)

    async def delete_route_binding(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        route_id: UUID,
    ) -> ContentRouteDeleteOut:
        deleted = await ContentRouteRecord.filter(
            id=route_id,
            workspace_id=workspace_id,
            site_id=site_id,
        ).delete()
        if not deleted:
            raise NotFound("Content route not found", error="CONTENT_ROUTE_NOT_FOUND")
        return ContentRouteDeleteOut(route_id=route_id)

    async def list_tree_nodes_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
        entry_id: UUID | None = None,
        parent_entry_id: UUID | None = None,
    ) -> PageData[ContentTreeNodeOut]:
        qs = ContentTreeNodeRecord.filter(workspace_id=workspace_id, site_id=site_id)
        if entry_id is not None:
            qs = qs.filter(entry_id=entry_id)
        if parent_entry_id is not None:
            qs = qs.filter(parent_entry_id=parent_entry_id)
        rows = await qs.order_by("sort_order", "id").all()
        out = [to_content_tree_node_out(record) for record in rows]
        return paginate_items(out, params=params)

    async def upsert_tree_node(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
        payload: ContentTreeNodeUpsertIn,
    ) -> ContentTreeNodeOut:
        entry = await ContentEntryRecord.get_or_none(id=entry_id, workspace_id=workspace_id, site_id=site_id)
        if entry is None:
            raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")

        parent_entry_id = UUID(str(payload.parent_entry_id)) if payload.parent_entry_id is not None else None
        if parent_entry_id is not None:
            parent = await ContentEntryRecord.get_or_none(
                id=parent_entry_id, workspace_id=workspace_id, site_id=site_id
            )
            if parent is None:
                raise NotFound("Parent entry not found", error="CONTENT_TREE_PARENT_NOT_FOUND")
            await assert_no_tree_parent_cycle(site_id=site_id, entry_id=entry_id, parent_entry_id=parent_entry_id)

        sort_order = int(payload.sort_order or 0)

        async with in_transaction() as conn:
            record = (
                await ContentTreeNodeRecord
                .filter(site_id=site_id, entry_id=entry_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if record is None:
                try:
                    record = await ContentTreeNodeRecord.create(
                        workspace_id=workspace_id,
                        site_id=site_id,
                        entry_id=UUID(str(entry.id)),
                        parent_entry_id=parent_entry_id,
                        sort_order=sort_order,
                        using_db=conn,
                    )
                except IntegrityError:
                    raise Conflict("Content tree node conflict", error="CONTENT_TREE_NODE_CONFLICT") from None
            else:
                record.parent_entry_id = parent_entry_id
                record.sort_order = sort_order
                await record.save(update_fields=["parent_entry_id", "sort_order"], using_db=conn)

        refreshed = await ContentTreeNodeRecord.get_or_none(
            workspace_id=workspace_id, site_id=site_id, entry_id=entry_id
        )
        if refreshed is None:
            raise NotFound("Content tree node not found", error="CONTENT_TREE_NODE_NOT_FOUND")
        return to_content_tree_node_out(refreshed)

    async def delete_tree_node(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        entry_id: UUID,
    ) -> ContentTreeNodeDeleteOut:
        deleted = await ContentTreeNodeRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
            entry_id=entry_id,
        ).delete()
        if not deleted:
            raise NotFound("Content tree node not found", error="CONTENT_TREE_NODE_NOT_FOUND")
        return ContentTreeNodeDeleteOut(entry_id=entry_id)
