from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.content._enums import ContentShapeState, ContentWorkflowStage, PublishArtifactKind
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.publish_artifact import PublishArtifactRecord
from src.models.content.published_graph import PublishedGraphRecord
from src.models.content.release import ContentReleaseRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.modules.projects.content.continuation import CONTINUATION_TRUTH_MISSING_REASON_CODE
from src.modules.projects.content.items.domain_helpers import WORKFLOW_PUBLISH_BLOCKER_CODE, item_has_capability
from src.modules.projects.publish.schema import (
    PublishArtifactsOut,
    PublishBlockedItemOut,
    PublishImpactOut,
    PublishReadinessSummaryOut,
)
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.schema import TenantContext

_PRESENTATION_KINDS_EXCLUDED_FROM_COMPONENT_MANIFEST = frozenset({"seo", "slot_mapping"})


def _empty_impact() -> PublishImpactOut:
    return PublishImpactOut(
        missing_routes=[],
        unresolved_relations=[],
        unpublished_dependencies=[],
        blocked_items=[],
        readiness_summary=PublishReadinessSummaryOut(ready=True),
    )


def _has_blockers(impact: PublishImpactOut) -> bool:
    return bool(
        impact.missing_routes or impact.unresolved_relations or impact.unpublished_dependencies or impact.blocked_items
    )


def _append_blocked_item(
    impact: PublishImpactOut,
    *,
    item: ContentItemRecord,
    reason_code: str,
    reason_meta: dict[str, object] | None = None,
) -> None:
    impact.blocked_items.append(
        PublishBlockedItemOut(
            item_id=item.id,
            reason_code=reason_code,
            shape_state=str(item.shape_state),
            surface=str(item.resolved_surface) if item.resolved_surface is not None else None,
            reason_meta=reason_meta,
            workflow_stage=str(item.workflow_stage) if item.workflow_stage is not None else None,
        )
    )


def _refresh_readiness_summary(impact: PublishImpactOut, *, selected_item_count: int) -> None:
    blocker_codes = sorted({blocked.reason_code for blocked in impact.blocked_items})
    impact.readiness_summary = PublishReadinessSummaryOut(
        ready=not _has_blockers(impact),
        selected_item_count=selected_item_count,
        blocked_item_count=len(impact.blocked_items),
        blocker_codes=blocker_codes,
    )


async def _load_publishable_items(
    *,
    workspace_id: UUID,
    site_id: UUID,
    conn: BaseDBAsyncClient,
) -> list[ContentItemRecord]:
    rows = (
        await ContentItemRecord
        .filter(
            workspace_id=workspace_id,
            site_id=site_id,
            published_version__not_isnull=True,
        )
        .using_db(conn)
        .prefetch_related("model_definition")
        .all()
    )
    return [row for row in rows if item_has_capability(row, "publishable")]


def _requires_route(item: ContentItemRecord) -> bool:
    return item_has_capability(item, "routable")


async def _load_active_route_map(
    *,
    site_id: UUID,
    conn: BaseDBAsyncClient,
) -> dict[tuple[UUID, str], RouteBindingRecord]:
    rows = await RouteBindingRecord.filter(site_id=site_id, is_active=True).using_db(conn).all()
    return {(row.item_id, row.locale): row for row in rows}


async def _load_published_versions(
    *,
    item_ids: list[UUID],
    conn: BaseDBAsyncClient,
) -> dict[tuple[UUID, int], ContentVersionRecord]:
    if not item_ids:
        return {}
    rows = await ContentVersionRecord.filter(item_id__in=item_ids).using_db(conn).all()
    return {(row.item_id, row.version): row for row in rows}


async def _load_hierarchy_map(*, site_id: UUID, conn: BaseDBAsyncClient) -> dict[UUID, HierarchyNodeRecord]:
    rows = await HierarchyNodeRecord.filter(site_id=site_id).using_db(conn).all()
    return {row.item_id: row for row in rows}


async def _load_seo_profile_map(
    *,
    version_ids: list[UUID],
    conn: BaseDBAsyncClient,
) -> dict[UUID, SEOProfileRecord]:
    if not version_ids:
        return {}
    rows = await SEOProfileRecord.filter(version_id__in=version_ids).using_db(conn).all()
    return {row.version_id: row for row in rows}


async def _load_component_binding_map(
    *,
    version_ids: list[UUID],
    conn: BaseDBAsyncClient,
) -> dict[UUID, list[ComponentBindingRecord]]:
    if not version_ids:
        return {}
    rows = (
        await ComponentBindingRecord
        .filter(version_id__in=version_ids)
        .using_db(conn)
        .order_by("sort_order", "id")
        .all()
    )
    out: dict[UUID, list[ComponentBindingRecord]] = {}
    for row in rows:
        out.setdefault(row.version_id, []).append(row)
    return out


async def _load_component_manifest_map(
    *,
    version_ids: list[UUID],
    conn: BaseDBAsyncClient,
) -> dict[UUID, dict[str, object]]:
    if not version_ids:
        return {}
    rows = (
        await PresentationDocumentRecord.filter(version_id__in=version_ids).using_db(conn).order_by("kind", "id").all()
    )
    out: dict[UUID, list[dict[str, object] | None]] = {}
    for row in rows:
        if row.kind in _PRESENTATION_KINDS_EXCLUDED_FROM_COMPONENT_MANIFEST:
            continue
        version_rows = out.setdefault(row.version_id, [])
        version_rows.append({"kind": row.kind, "payload": row.payload})
    return {version_id: {"presentations": presentations} for version_id, presentations in out.items() if presentations}


async def _next_release_number(*, site_id: UUID, conn) -> int:
    latest = await ContentReleaseRecord.filter(site_id=site_id).using_db(conn).order_by("-release_number").first()
    return (int(latest.release_number) if latest is not None else 0) + 1


class ProjectPublishService:
    def __init__(self, tenant_context: TenantContext) -> None:
        self.tenant_context = tenant_context
        self.tenant_db = TenantDatabaseRouter(tenant_context)

    async def preview_impact(self, *, workspace_id: UUID, site_id: UUID) -> PublishImpactOut:
        async with self.tenant_db.connection() as conn:
            items = await _load_publishable_items(workspace_id=workspace_id, site_id=site_id, conn=conn)
            if not items:
                return _empty_impact()

            route_map = await _load_active_route_map(site_id=site_id, conn=conn)
            published_item_ids = {item.id for item in items}
            hierarchy_map = await _load_hierarchy_map(site_id=site_id, conn=conn)
            impact = _empty_impact()
            for item in items:
                if (
                    item.shape_state != ContentShapeState.READY
                    or item.resolved_surface is None
                    or item.resolved_role is None
                    or item.resolved_posture is None
                ):
                    _append_blocked_item(
                        impact,
                        item=item,
                        reason_code=item.shape_reason_code or CONTINUATION_TRUTH_MISSING_REASON_CODE,
                        reason_meta=item.shape_reason_meta if isinstance(item.shape_reason_meta, dict) else None,
                    )
                    continue
                if item.workflow_stage != ContentWorkflowStage.APPROVED:
                    _append_blocked_item(
                        impact,
                        item=item,
                        reason_code=WORKFLOW_PUBLISH_BLOCKER_CODE,
                        reason_meta={"workflowStage": str(item.workflow_stage)},
                    )
                    continue
                route_key = (item.id, item.locale)
                if _requires_route(item) and route_map.get(route_key) is None:
                    impact.missing_routes.append(item.id)
                    _append_blocked_item(
                        impact,
                        item=item,
                        reason_code="MISSING_ROUTE",
                        reason_meta={"locale": item.locale},
                    )
                node = hierarchy_map.get(item.id)
                parent_item_id = node.parent_item_id if node is not None else None
                if parent_item_id is not None and parent_item_id not in published_item_ids:
                    impact.unpublished_dependencies.append(item.id)
                    _append_blocked_item(
                        impact,
                        item=item,
                        reason_code="PARENT_UNPUBLISHED",
                        reason_meta={"parentItemId": str(parent_item_id)},
                    )
            _refresh_readiness_summary(impact, selected_item_count=len(items))
            return impact

    async def publish_release(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        actor_user_id: UUID | None,
    ) -> tuple[ContentReleaseRecord, PublishArtifactsOut]:
        impact = await self.preview_impact(workspace_id=workspace_id, site_id=site_id)
        if _has_blockers(impact):
            raise Conflict(
                "Publish blocked by unresolved impact",
                error="PUBLISH_VALIDATION_FAILED",
                meta=impact.model_dump(mode="json"),
            )

        async with self.tenant_db.connection() as conn:
            items = await _load_publishable_items(workspace_id=workspace_id, site_id=site_id, conn=conn)
            route_map = await _load_active_route_map(site_id=site_id, conn=conn)
            item_ids = [item.id for item in items]
            version_map = await _load_published_versions(item_ids=item_ids, conn=conn)
            hierarchy_map = await _load_hierarchy_map(site_id=site_id, conn=conn)
            version_ids = [version.id for version in version_map.values()]
            seo_profile_map = await _load_seo_profile_map(version_ids=version_ids, conn=conn)
            component_binding_map = await _load_component_binding_map(version_ids=version_ids, conn=conn)
            component_manifest_map = await _load_component_manifest_map(version_ids=version_ids, conn=conn)
            current_active_release = (
                await ContentReleaseRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    is_active=True,
                )
                .using_db(conn)
                .order_by("-release_number")
                .first()
            )
            release = await ContentReleaseRecord.create(
                using_db=conn,
                workspace_id=workspace_id,
                site_id=site_id,
                release_number=await _next_release_number(site_id=site_id, conn=conn),
                is_active=True,
                created_by_user_id=actor_user_id,
                lineage_parent_release_id=current_active_release.id if current_active_release is not None else None,
                selection_count=len(items),
            )
            rows: list[PublishedGraphRecord] = []
            artifact_rows: list[PublishArtifactRecord] = []
            for item in items:
                route = route_map.get((item.id, item.locale))
                if _requires_route(item) and route is None:
                    raise Conflict(
                        "Publish route missing for routable item",
                        error="PUBLISH_ROUTE_MISSING",
                        meta={"itemId": str(item.id), "locale": item.locale},
                    )
                version = version_map.get((item.id, int(item.published_version or 0)))
                if version is None:
                    continue
                node = hierarchy_map.get(item.id)
                rows.append(
                    PublishedGraphRecord(
                        release_id=release.id,
                        workspace_id=workspace_id,
                        site_id=site_id,
                        item_id=item.id,
                        version_id=version.id,
                        locale=route.locale if route is not None else item.locale,
                        route_path=route.path if route is not None else f"/__release/{item.id}",
                        route_contract=route.route_contract if route is not None else None,
                        hierarchy_parent_item_id=node.parent_item_id if node is not None else None,
                        hierarchy_sort_order=node.sort_order if node is not None else 0,
                    )
                )
                if route is not None:
                    artifact_rows.append(
                        PublishArtifactRecord(
                            release_id=release.id,
                            workspace_id=workspace_id,
                            site_id=site_id,
                            item_id=item.id,
                            version_id=version.id,
                            artifact_kind=PublishArtifactKind.ROUTE_MANIFEST,
                            locale=route.locale,
                            payload={
                                "path": route.path,
                                "parentItemId": str(node.parent_item_id) if node and node.parent_item_id else None,
                                "sortOrder": node.sort_order if node is not None else 0,
                            },
                        )
                    )
                artifact_rows.append(
                    PublishArtifactRecord(
                        release_id=release.id,
                        workspace_id=workspace_id,
                        site_id=site_id,
                        item_id=item.id,
                        version_id=version.id,
                        artifact_kind=PublishArtifactKind.RENDER_HINTS,
                        locale=route.locale if route is not None else item.locale,
                        payload={
                            "role": str(item.resolved_role) if item.resolved_role is not None else None,
                            "posture": str(item.resolved_posture) if item.resolved_posture is not None else None,
                            "surface": str(item.resolved_surface) if item.resolved_surface is not None else None,
                            "shapeState": str(item.shape_state),
                            "reasonCode": item.shape_reason_code,
                            "reasonMeta": item.shape_reason_meta if isinstance(item.shape_reason_meta, dict) else None,
                        },
                    )
                )

                component_manifest = component_manifest_map.get(version.id)
                if component_manifest is not None:
                    artifact_rows.append(
                        PublishArtifactRecord(
                            release_id=release.id,
                            workspace_id=workspace_id,
                            site_id=site_id,
                            item_id=item.id,
                            version_id=version.id,
                            artifact_kind=PublishArtifactKind.COMPONENT_MANIFEST,
                            locale=route.locale if route is not None else item.locale,
                            payload=component_manifest,
                        )
                    )

                seo_profile = seo_profile_map.get(version.id)
                if seo_profile is not None:
                    artifact_rows.append(
                        PublishArtifactRecord(
                            release_id=release.id,
                            workspace_id=workspace_id,
                            site_id=site_id,
                            item_id=item.id,
                            version_id=version.id,
                            artifact_kind=PublishArtifactKind.SEO_METADATA,
                            locale=route.locale if route is not None else item.locale,
                            payload=seo_profile.payload,
                        )
                    )

                bindings = component_binding_map.get(version.id, [])
                if bindings:
                    artifact_rows.append(
                        PublishArtifactRecord(
                            release_id=release.id,
                            workspace_id=workspace_id,
                            site_id=site_id,
                            item_id=item.id,
                            version_id=version.id,
                            artifact_kind=PublishArtifactKind.BINDING_MANIFEST,
                            locale=route.locale if route is not None else item.locale,
                            payload={
                                "bindings": [
                                    {
                                        "componentKey": binding.component_key,
                                        "bindingKey": binding.binding_key,
                                        "payload": binding.binding_payload,
                                    }
                                    for binding in bindings
                                ]
                            },
                        )
                    )

            await (
                ContentReleaseRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    is_active=True,
                )
                .exclude(id=release.id)
                .using_db(conn)
                .update(is_active=False)
            )
            if rows:
                await PublishedGraphRecord.bulk_create(rows, using_db=conn)
            if artifact_rows:
                await PublishArtifactRecord.bulk_create(artifact_rows, using_db=conn)
        return release, PublishArtifactsOut(graph_nodes=len(rows), impact=impact, selection_count=len(items))
