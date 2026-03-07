from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.src.core.exceptions import Conflict
from apps.api.src.modules.workspaces.content.pages.repair_meta import (
    load_latest_revision_paths,
    load_page_entry_repair_context,
    load_site_page_repair_meta,
    try_load_legacy_page_meta,
)
from apps.api.src.modules.workspaces.content.pages.repair_ops import (
    RouteTreeState,
    load_active_route_paths,
    load_route_tree_state,
    repair_missing_routes,
    repair_missing_tree_nodes,
)


@dataclass(frozen=True)
class PageRouteTreeRepairStats:
    missing_routes: int
    missing_tree_nodes: int
    repaired_routes: int
    repaired_tree_nodes: int
    orphan_parents_detached: int


def _empty_stats() -> PageRouteTreeRepairStats:
    return PageRouteTreeRepairStats(
        missing_routes=0,
        missing_tree_nodes=0,
        repaired_routes=0,
        repaired_tree_nodes=0,
        orphan_parents_detached=0,
    )


def _compute_repair_ids(
    *,
    entry_ids: list[UUID],
    state: RouteTreeState,
) -> tuple[list[UUID], list[UUID], list[UUID]]:
    missing_route_ids = [entry_id for entry_id in entry_ids if entry_id not in state.has_active_route]
    missing_tree_ids = [entry_id for entry_id in entry_ids if entry_id not in state.has_tree_node]
    needs_new_routes = [entry_id for entry_id in missing_route_ids if entry_id not in state.routes_by_entry_id]
    legacy_meta_ids = sorted(set(needs_new_routes) | set(missing_tree_ids))
    return missing_route_ids, missing_tree_ids, legacy_meta_ids


async def repair_legacy_page_route_tree(
    *,
    workspace_id: UUID,
    site_id: UUID,
    page_entry_ids: Iterable[UUID],
) -> PageRouteTreeRepairStats:
    """Repair/backfill missing page Route/Tree capability records (explicit one-time admin action)."""

    entry_ids = [UUID(str(entry_id)) for entry_id in page_entry_ids]
    if not entry_ids:
        return _empty_stats()

    entry_id_set = set(entry_ids)
    async with in_transaction() as conn:
        state = await load_route_tree_state(conn=conn, site_id=site_id, entry_ids=entry_ids)
        missing_route_ids, missing_tree_ids, legacy_meta_ids = _compute_repair_ids(entry_ids=entry_ids, state=state)

        entry_ctx_by_id = await load_page_entry_repair_context(
            conn=conn, workspace_id=workspace_id, site_id=site_id, entry_ids=entry_ids
        )
        site_page_meta_by_id = await load_site_page_repair_meta(conn=conn, site_id=site_id, entry_ids=entry_ids)
        revision_path_by_entry_id = await load_latest_revision_paths(conn=conn, entry_ids=entry_ids)
        legacy_meta_result = await try_load_legacy_page_meta(conn=conn, site_id=site_id, entry_ids=legacy_meta_ids)

        repaired_routes = await repair_missing_routes(
            conn=conn,
            workspace_id=workspace_id,
            site_id=site_id,
            missing_route_ids=missing_route_ids,
            routes_by_entry_id=state.routes_by_entry_id,
            entry_ctx_by_id=entry_ctx_by_id,
            site_page_meta_by_id=site_page_meta_by_id,
            revision_path_by_entry_id=revision_path_by_entry_id,
            legacy_meta_result=legacy_meta_result,
        )

        path_by_entry_id = await load_active_route_paths(conn=conn, site_id=site_id, entry_ids=entry_ids)
        if entry_id_set.difference(path_by_entry_id.keys()):
            raise Conflict("Page route missing after repair", error="PAGE_ROUTE_TREE_REPAIR_ROUTE_MISSING_AFTER_REPAIR")

        repaired_tree_nodes, orphan_parents_detached = await repair_missing_tree_nodes(
            conn=conn,
            workspace_id=workspace_id,
            site_id=site_id,
            missing_tree_ids=missing_tree_ids,
            page_entry_id_set=entry_id_set,
            path_by_entry_id=path_by_entry_id,
            site_page_meta_by_id=site_page_meta_by_id,
            legacy_meta_result=legacy_meta_result,
        )

        return PageRouteTreeRepairStats(
            missing_routes=len(missing_route_ids),
            missing_tree_nodes=len(missing_tree_ids),
            repaired_routes=repaired_routes,
            repaired_tree_nodes=repaired_tree_nodes,
            orphan_parents_detached=orphan_parents_detached,
        )
