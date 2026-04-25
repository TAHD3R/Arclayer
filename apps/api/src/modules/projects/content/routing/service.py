from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.core.exceptions import Conflict, NotFound
from src.models.content.content_item import ContentItemRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.route_binding import RouteBindingRecord
from src.modules.projects.content.items.domain_helpers import item_has_capability
from src.modules.projects.content.routing.schema import (
    HierarchyNodeOut,
    HierarchyNodeUpsertIn,
    RouteBindingOut,
    RouteBindingUpsertIn,
    RoutePrimarySourceOut,
)
from src.modules.sites.shared.service import normalize_path
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.schema import TenantContext


@dataclass(frozen=True, slots=True)
class ParsedRoutePattern:
    path: str
    mode: Literal["static", "dynamic"]
    params: tuple[str, ...]
    structure_signature: str
    segment_count: int
    static_segment_count: int
    param_count: int


@dataclass(frozen=True, slots=True)
class RouteMatchResult:
    params: dict[str, str]
    binding: RouteBindingRecord
    pattern: ParsedRoutePattern


def _normalize_route_path(path: str) -> str:
    pathname = normalize_path(path)
    if "?" in pathname or "#" in pathname or "\\" in pathname:
        raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
    if "//" in pathname:
        raise Conflict("Invalid path", error="CONTENT_ROUTE_PATH_INVALID")
    return pathname


def _split_route_segments(path: str) -> list[str]:
    if path == "/":
        return []
    return [segment for segment in path.strip("/").split("/") if segment]


def parse_route_pattern(path: str, *, route_mode: Literal["static", "dynamic"] | None = None) -> ParsedRoutePattern:
    normalized = _normalize_route_path(path)
    segments = _split_route_segments(normalized)
    params: list[str] = []
    signature_segments: list[str] = []
    static_segment_count = 0
    saw_dynamic = False
    for raw_segment in segments:
        segment = raw_segment.strip()
        if segment.startswith(":"):
            param_name = segment[1:].strip()
            if not param_name:
                raise Conflict("Invalid route pattern", error="CONTENT_ROUTE_PATH_INVALID")
            if param_name in params:
                raise Conflict("Duplicate route param", error="CONTENT_ROUTE_PATH_INVALID")
            params.append(param_name)
            signature_segments.append(":")
            saw_dynamic = True
            continue
        if ":" in segment:
            raise Conflict("Invalid route segment", error="CONTENT_ROUTE_PATH_INVALID")
        static_segment_count += 1
        signature_segments.append(segment)
    inferred_mode: Literal["static", "dynamic"] = "dynamic" if saw_dynamic else "static"
    effective_mode = route_mode or inferred_mode
    if effective_mode != inferred_mode:
        raise Conflict("Route mode does not match pattern", error="CONTENT_ROUTE_CONTRACT_INVALID")
    signature = "/" if not signature_segments else "/" + "/".join(signature_segments)
    return ParsedRoutePattern(
        path=normalized,
        mode=effective_mode,
        params=tuple(params),
        structure_signature=signature,
        segment_count=len(segments),
        static_segment_count=static_segment_count,
        param_count=len(params),
    )


def build_route_contract(payload: RouteBindingUpsertIn) -> dict[str, Any]:
    pattern = parse_route_pattern(payload.path, route_mode=payload.route_mode)
    if pattern.mode == "dynamic":
        primary_source = payload.primary_source
        if primary_source is None:
            raise Conflict("Dynamic route requires a primary source", error="CONTENT_ROUTE_CONTRACT_INVALID")
        param_name = primary_source.param_name.strip()
        if param_name not in pattern.params:
            raise Conflict("Dynamic route param mapping invalid", error="CONTENT_ROUTE_CONTRACT_INVALID")
        primary_source_contract = {
            "modelKey": primary_source.model_key.strip(),
            "fieldKey": primary_source.field_key.strip(),
            "paramName": param_name,
        }
    else:
        primary_source_contract = None

    if pattern.mode == "static" and payload.primary_source is not None:
        raise Conflict("Static route cannot declare a primary source", error="CONTENT_ROUTE_CONTRACT_INVALID")

    return {
        "mode": pattern.mode,
        "priority": int(payload.route_priority),
        "structureSignature": pattern.structure_signature,
        "params": list(pattern.params),
        "segmentCount": pattern.segment_count,
        "staticSegmentCount": pattern.static_segment_count,
        "paramCount": pattern.param_count,
        "primarySource": primary_source_contract,
    }


def route_sort_key(record: RouteBindingRecord) -> tuple[int, int, int, int, int, str]:
    contract = record.route_contract if isinstance(record.route_contract, dict) else {}
    mode = str(contract.get("mode") or ("dynamic" if ":" in record.path else "static"))
    static_bias = 0 if mode == "static" else 1
    static_segments = int(contract.get("staticSegmentCount") or 0)
    segment_count = int(contract.get("segmentCount") or 0)
    param_count = int(contract.get("paramCount") or 0)
    priority = int(contract.get("priority") or 0)
    return (static_bias, -static_segments, -segment_count, param_count, -priority, str(record.path))


def match_route_binding(record: RouteBindingRecord, pathname: str) -> dict[str, str] | None:
    pattern = parse_route_pattern(record.path)
    if pattern.mode == "static":
        return {} if pattern.path == pathname else None

    path_segments = _split_route_segments(pathname)
    pattern_segments = _split_route_segments(record.path)
    if len(path_segments) != len(pattern_segments):
        return None

    params: dict[str, str] = {}
    for pattern_segment, actual_segment in zip(pattern_segments, path_segments, strict=False):
        if pattern_segment.startswith(":"):
            param_name = pattern.params[len(params)]
            params[param_name] = actual_segment
            continue
        if pattern_segment != actual_segment:
            return None
    return params


def _to_route_binding_out(record: RouteBindingRecord) -> RouteBindingOut:
    contract = record.route_contract if isinstance(record.route_contract, dict) else {}
    primary_source = contract.get("primarySource")
    return RouteBindingOut(
        id=record.id,
        workspace_id=record.workspace_id,
        site_id=record.site_id,
        item_id=record.item_id,
        locale=record.locale,
        path=record.path,
        routeMode=str(contract.get("mode") or ("dynamic" if ":" in record.path else "static")),
        routePriority=int(contract.get("priority") or 0),
        structureSignature=str(
            contract.get("structureSignature") or parse_route_pattern(record.path).structure_signature
        ),
        primarySource=(
            RoutePrimarySourceOut.model_validate(primary_source) if isinstance(primary_source, dict) else None
        ),
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


async def _get_item_with_model(
    *,
    workspace_id: UUID,
    site_id: UUID,
    item_id: UUID,
    conn: BaseDBAsyncClient,
) -> ContentItemRecord:
    item = (
        await ContentItemRecord
        .filter(
            workspace_id=workspace_id,
            site_id=site_id,
            id=item_id,
        )
        .using_db(conn)
        .prefetch_related("model_definition")
        .first()
    )
    if item is None:
        raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
    return item


async def _ensure_no_hierarchy_cycle(
    *,
    site_id: UUID,
    item_id: UUID,
    parent_item_id: UUID | None,
    conn: BaseDBAsyncClient,
) -> None:
    if parent_item_id is None:
        return
    if parent_item_id == item_id:
        raise Conflict("Parent cycle detected", error="CONTENT_HIERARCHY_CYCLE")

    cursor = parent_item_id
    while cursor is not None:
        if cursor == item_id:
            raise Conflict("Parent cycle detected", error="CONTENT_HIERARCHY_CYCLE")
        node = await HierarchyNodeRecord.get_or_none(site_id=site_id, item_id=cursor, using_db=conn)
        cursor = node.parent_item_id if node is not None else None


async def _ensure_no_pattern_conflict(
    *,
    site_id: UUID,
    locale: str,
    item_id: UUID,
    pattern: ParsedRoutePattern,
    conn,
) -> None:
    if pattern.mode != "dynamic":
        return
    rows = await RouteBindingRecord.filter(site_id=site_id, locale=locale).using_db(conn).exclude(item_id=item_id).all()
    for row in rows:
        contract = row.route_contract if isinstance(row.route_contract, dict) else {}
        row_signature = str(contract.get("structureSignature") or parse_route_pattern(row.path).structure_signature)
        row_mode = str(contract.get("mode") or ("dynamic" if ":" in row.path else "static"))
        if row_mode == "dynamic" and row_signature == pattern.structure_signature:
            raise Conflict("Content route pattern conflict", error="CONTENT_ROUTE_PATTERN_CONFLICT")


class ProjectContentRoutingService:
    def __init__(self, tenant_context: TenantContext) -> None:
        self.tenant_db = TenantDatabaseRouter(tenant_context)

    async def list_route_bindings(self, *, workspace_id: UUID, site_id: UUID) -> list[RouteBindingOut]:
        async with self.tenant_db.connection() as conn:
            rows = (
                await RouteBindingRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .order_by("locale", "path")
            )
            return [_to_route_binding_out(row) for row in rows]

    async def upsert_route_binding(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        payload: RouteBindingUpsertIn,
    ) -> RouteBindingOut:
        locale = payload.locale.strip() or "zh-CN"
        contract = build_route_contract(payload)
        pattern = parse_route_pattern(payload.path, route_mode=payload.route_mode)
        async with self.tenant_db.connection() as conn:
            item = await _get_item_with_model(workspace_id=workspace_id, site_id=site_id, item_id=item_id, conn=conn)
            if not item_has_capability(item, "routable"):
                raise Conflict("Content item is not routable", error="CONTENT_ITEM_NOT_ROUTABLE")
            await _ensure_no_pattern_conflict(
                site_id=site_id,
                locale=locale,
                item_id=item_id,
                pattern=pattern,
                conn=conn,
            )
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
                        path=pattern.path,
                        route_contract=contract,
                        is_active=payload.is_active,
                        using_db=conn,
                    )
                except IntegrityError as exc:
                    raise Conflict("Content route conflict", error="CONTENT_ROUTE_CONFLICT") from exc
            else:
                record.path = pattern.path
                record.route_contract = contract
                record.is_active = payload.is_active
                try:
                    await record.save(update_fields=["path", "route_contract", "is_active"], using_db=conn)
                except IntegrityError as exc:
                    raise Conflict("Content route conflict", error="CONTENT_ROUTE_CONFLICT") from exc
        return _to_route_binding_out(record)

    async def list_hierarchy_nodes(self, *, workspace_id: UUID, site_id: UUID) -> list[HierarchyNodeOut]:
        async with self.tenant_db.connection() as conn:
            rows = (
                await HierarchyNodeRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
                .order_by("sort_order", "id")
            )
            return [_to_hierarchy_node_out(row) for row in rows]

    async def upsert_hierarchy_node(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        payload: HierarchyNodeUpsertIn,
    ) -> HierarchyNodeOut:
        parent_item_id = payload.parent_item_id
        async with self.tenant_db.connection() as conn:
            item = await _get_item_with_model(workspace_id=workspace_id, site_id=site_id, item_id=item_id, conn=conn)
            if not item_has_capability(item, "treeable"):
                raise Conflict("Content item is not treeable", error="CONTENT_ITEM_NOT_TREEABLE")

            if parent_item_id is not None:
                await _get_item_with_model(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=parent_item_id,
                    conn=conn,
                )
                await _ensure_no_hierarchy_cycle(
                    site_id=site_id,
                    item_id=item_id,
                    parent_item_id=parent_item_id,
                    conn=conn,
                )
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
