from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from apps.api.src.core.exceptions import Conflict
from apps.api.src.models.content.route import ContentRouteRecord
from apps.api.src.models.content.tree import ContentTreeNodeRecord
from apps.api.src.modules.sites.shared.service import validate_page_pathname
from apps.api.src.modules.workspaces.content.pages.repair_meta import (
    LegacyPageMetaLoadResult,
    PageEntryRepairContext,
    SitePageRepairMeta,
    parse_legacy_sort_order,
)


@dataclass(frozen=True)
class RouteTreeState:
    has_active_route: set[UUID]
    routes_by_entry_id: dict[UUID, list[ContentRouteRecord]]
    has_tree_node: set[UUID]


async def load_route_tree_state(
    *,
    conn: BaseDBAsyncClient,
    site_id: UUID,
    entry_ids: list[UUID],
) -> RouteTreeState:
    active_routes = await (
        ContentRouteRecord
        .filter(site_id=site_id, entry_id__in=entry_ids, is_active=True)
        .using_db(conn)
        .values_list("entry_id", flat=True)
    )
    has_active_route = {UUID(str(raw)) for raw in active_routes}

    all_routes = await ContentRouteRecord.filter(site_id=site_id, entry_id__in=entry_ids).using_db(conn).all()
    routes_by_entry_id: dict[UUID, list[ContentRouteRecord]] = {}
    for route in all_routes:
        entry_id = UUID(str(route.entry_id))
        routes_by_entry_id.setdefault(entry_id, []).append(route)

    tree_nodes = await (
        ContentTreeNodeRecord
        .filter(site_id=site_id, entry_id__in=entry_ids)
        .using_db(conn)
        .values_list("entry_id", flat=True)
    )
    has_tree_node = {UUID(str(raw)) for raw in tree_nodes}

    return RouteTreeState(
        has_active_route=has_active_route,
        routes_by_entry_id=routes_by_entry_id,
        has_tree_node=has_tree_node,
    )


async def load_active_route_paths(
    *,
    conn: BaseDBAsyncClient,
    site_id: UUID,
    entry_ids: list[UUID],
) -> dict[UUID, str]:
    if not entry_ids:
        return {}
    routes = (
        await ContentRouteRecord
        .filter(site_id=site_id, entry_id__in=entry_ids, is_active=True)
        .using_db(conn)
        .order_by("created_at", "id")
        .all()
    )
    out: dict[UUID, str] = {}
    for route in routes:
        entry_id = UUID(str(route.entry_id))
        if entry_id in out:
            continue
        out[entry_id] = str(route.path)
    return out


def infer_path_from_slug(slug: str) -> str | None:
    value = (slug or "").strip()
    if not value:
        return None
    if value == "index":
        return "/"
    return f"/{value}"


def resolve_repair_route_path(
    *,
    entry_id: UUID,
    entry_ctx_by_id: dict[UUID, PageEntryRepairContext],
    site_page_meta_by_id: dict[UUID, SitePageRepairMeta],
    revision_path_by_entry_id: dict[UUID, str],
    legacy_meta_result: LegacyPageMetaLoadResult,
) -> tuple[str, str]:
    ctx = entry_ctx_by_id.get(entry_id)
    locale = ctx.locale if ctx is not None else "zh-CN"

    site_page_meta = site_page_meta_by_id.get(entry_id)
    if site_page_meta is not None:
        return validate_page_pathname(site_page_meta.path), locale

    legacy_meta = legacy_meta_result.meta_by_id.get(entry_id)
    legacy_path = legacy_meta.get("path") if isinstance(legacy_meta, dict) else None
    if isinstance(legacy_path, str) and legacy_path.strip():
        return validate_page_pathname(legacy_path), locale

    revision_path = revision_path_by_entry_id.get(entry_id)
    if isinstance(revision_path, str) and revision_path.strip():
        return validate_page_pathname(revision_path), locale

    if ctx is not None:
        inferred = infer_path_from_slug(ctx.slug)
        if inferred is not None:
            return validate_page_pathname(inferred), locale

    raise Conflict(
        "Page route path unavailable for repair",
        error="PAGE_ROUTE_TREE_REPAIR_PATH_UNAVAILABLE",
        meta={
            "entryId": str(entry_id),
            "legacyMetaAvailable": legacy_meta_result.available,
        },
    )


async def repair_missing_routes(
    *,
    conn: BaseDBAsyncClient,
    workspace_id: UUID,
    site_id: UUID,
    missing_route_ids: list[UUID],
    routes_by_entry_id: dict[UUID, list[ContentRouteRecord]],
    entry_ctx_by_id: dict[UUID, PageEntryRepairContext],
    site_page_meta_by_id: dict[UUID, SitePageRepairMeta],
    revision_path_by_entry_id: dict[UUID, str],
    legacy_meta_result: LegacyPageMetaLoadResult,
) -> int:
    repaired = 0
    for entry_id in missing_route_ids:
        existing_routes = routes_by_entry_id.get(entry_id)
        if existing_routes:
            for route in existing_routes:
                if route.is_active:
                    continue
                route.is_active = True
                await route.save(update_fields=["is_active"], using_db=conn)
                repaired += 1
            continue

        path, locale = resolve_repair_route_path(
            entry_id=entry_id,
            entry_ctx_by_id=entry_ctx_by_id,
            site_page_meta_by_id=site_page_meta_by_id,
            revision_path_by_entry_id=revision_path_by_entry_id,
            legacy_meta_result=legacy_meta_result,
        )
        try:
            await ContentRouteRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=entry_id,
                locale=locale,
                path=path,
                is_active=True,
                using_db=conn,
            )
            repaired += 1
        except IntegrityError:
            raise Conflict(
                "Page route conflict",
                error="PAGE_ROUTE_TREE_REPAIR_ROUTE_CONFLICT",
                meta={"entryId": str(entry_id), "path": path, "locale": locale},
            ) from None

    return repaired


def infer_parent_entry_id_from_path(
    *,
    path: str,
    entry_id_by_path: dict[str, UUID],
) -> UUID | None:
    segments = path.split("/")[1:]
    if len(segments) <= 1:
        return None
    parent_path = "/" + "/".join(segments[:-1])
    return entry_id_by_path.get(parent_path)


def resolve_repair_tree_meta(
    *,
    entry_id: UUID,
    page_entry_id_set: set[UUID],
    path_by_entry_id: dict[UUID, str],
    entry_id_by_path: dict[str, UUID],
    site_page_meta_by_id: dict[UUID, SitePageRepairMeta],
    legacy_meta_result: LegacyPageMetaLoadResult,
) -> tuple[UUID | None, int, bool]:
    site_page_meta = site_page_meta_by_id.get(entry_id)
    if site_page_meta is not None:
        parent = site_page_meta.parent_entry_id
        sort_order = int(site_page_meta.sort_order or 0)
        detached = parent is not None and parent not in page_entry_id_set
        return (None if detached else parent), sort_order, detached

    legacy_meta = legacy_meta_result.meta_by_id.get(entry_id)
    raw_parent = legacy_meta.get("parent_entry_id") if isinstance(legacy_meta, dict) else None
    raw_sort = legacy_meta.get("sort_order") if isinstance(legacy_meta, dict) else None

    parent_entry_id = UUID(str(raw_parent)) if raw_parent is not None else None
    detached = parent_entry_id is not None and parent_entry_id not in page_entry_id_set
    parent_entry_id = None if detached else parent_entry_id

    if parent_entry_id is not None or raw_sort is not None:
        return parent_entry_id, parse_legacy_sort_order(raw_sort), detached

    path = path_by_entry_id.get(entry_id) or "/"
    inferred_parent = infer_parent_entry_id_from_path(path=path, entry_id_by_path=entry_id_by_path)
    if inferred_parent is None:
        return None, 0, False
    if inferred_parent not in page_entry_id_set:
        return None, 0, True
    return inferred_parent, 0, False


async def repair_missing_tree_nodes(
    *,
    conn: BaseDBAsyncClient,
    workspace_id: UUID,
    site_id: UUID,
    missing_tree_ids: list[UUID],
    page_entry_id_set: set[UUID],
    path_by_entry_id: dict[UUID, str],
    site_page_meta_by_id: dict[UUID, SitePageRepairMeta],
    legacy_meta_result: LegacyPageMetaLoadResult,
) -> tuple[int, int]:
    entry_id_by_path: dict[str, UUID] = {}
    for entry_id, path in path_by_entry_id.items():
        if path not in entry_id_by_path:
            entry_id_by_path[path] = entry_id

    repaired = 0
    orphan_parents_detached = 0
    for entry_id in missing_tree_ids:
        parent_entry_id, sort_order, detached = resolve_repair_tree_meta(
            entry_id=entry_id,
            page_entry_id_set=page_entry_id_set,
            path_by_entry_id=path_by_entry_id,
            entry_id_by_path=entry_id_by_path,
            site_page_meta_by_id=site_page_meta_by_id,
            legacy_meta_result=legacy_meta_result,
        )
        if detached:
            orphan_parents_detached += 1
        try:
            await ContentTreeNodeRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                entry_id=entry_id,
                parent_entry_id=parent_entry_id,
                sort_order=int(sort_order or 0),
                using_db=conn,
            )
            repaired += 1
        except IntegrityError:
            raise Conflict("Page tree node conflict", error="PAGE_ROUTE_TREE_REPAIR_TREE_CONFLICT") from None
    return repaired, orphan_parents_detached
