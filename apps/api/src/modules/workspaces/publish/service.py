from __future__ import annotations

from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.src.core.exceptions import Conflict
from apps.api.src.models.content._enums import PublishArtifactKind
from apps.api.src.models.content.component_binding import ComponentBindingRecord
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.hierarchy_node import HierarchyNodeRecord
from apps.api.src.models.content.publish_artifact import PublishArtifactRecord
from apps.api.src.models.content.published_graph import PublishedGraphRecord
from apps.api.src.models.content.route_binding import RouteBindingRecord
from apps.api.src.models.content.seo_profile import SEOProfileRecord
from apps.api.src.modules.workspaces.publish.schema import PublishArtifactsOut, PublishImpactOut


def _has_model_capability(item: ContentItemRecord, capability: str) -> bool:
    capabilities = getattr(item.model_definition, "capabilities", None)
    return isinstance(capabilities, list) and capability in capabilities


def _empty_impact() -> PublishImpactOut:
    return PublishImpactOut(missing_routes=[], unresolved_relations=[], unpublished_dependencies=[])


def _has_blockers(impact: PublishImpactOut) -> bool:
    return bool(impact.missing_routes or impact.unresolved_relations or impact.unpublished_dependencies)


async def _load_publishable_items(*, workspace_id: UUID, site_id: UUID) -> list[ContentItemRecord]:
    rows = (
        await ContentItemRecord
        .filter(
            workspace_id=workspace_id,
            site_id=site_id,
            published_version__not_isnull=True,
        )
        .prefetch_related("model_definition")
        .all()
    )
    return [row for row in rows if _has_model_capability(row, "publishable")]


async def _load_active_route_map(*, site_id: UUID) -> dict[tuple[UUID, str], RouteBindingRecord]:
    rows = await RouteBindingRecord.filter(site_id=site_id, is_active=True).all()
    return {(row.item_id, row.locale): row for row in rows}


async def _load_published_versions(*, item_ids: list[UUID]) -> dict[tuple[UUID, int], ContentVersionRecord]:
    if not item_ids:
        return {}
    rows = await ContentVersionRecord.filter(item_id__in=item_ids).all()
    return {(row.item_id, row.version): row for row in rows}


async def _load_hierarchy_map(*, site_id: UUID) -> dict[UUID, HierarchyNodeRecord]:
    rows = await HierarchyNodeRecord.filter(site_id=site_id).all()
    return {row.item_id: row for row in rows}


async def _load_seo_profile_map(*, version_ids: list[UUID]) -> dict[UUID, SEOProfileRecord]:
    if not version_ids:
        return {}
    rows = await SEOProfileRecord.filter(version_id__in=version_ids).all()
    return {row.version_id: row for row in rows}


async def _load_component_binding_map(*, version_ids: list[UUID]) -> dict[UUID, list[ComponentBindingRecord]]:
    if not version_ids:
        return {}
    rows = await ComponentBindingRecord.filter(version_id__in=version_ids).order_by("sort_order", "id").all()
    out: dict[UUID, list[ComponentBindingRecord]] = {}
    for row in rows:
        out.setdefault(row.version_id, []).append(row)
    return out


class WorkspacePublishService:
    async def preview_impact(self, *, workspace_id: UUID, site_id: UUID) -> PublishImpactOut:
        items = await _load_publishable_items(workspace_id=workspace_id, site_id=site_id)
        if not items:
            return _empty_impact()

        route_map = await _load_active_route_map(site_id=site_id)
        published_item_ids = {item.id for item in items}
        hierarchy_map = await _load_hierarchy_map(site_id=site_id)
        impact = _empty_impact()
        for item in items:
            route_key = (item.id, item.locale)
            if route_map.get(route_key) is None:
                impact.missing_routes.append(item.id)
            node = hierarchy_map.get(item.id)
            parent_item_id = node.parent_item_id if node is not None else None
            if parent_item_id is not None and parent_item_id not in published_item_ids:
                impact.unpublished_dependencies.append(item.id)
        return impact

    async def build_artifacts(self, *, workspace_id: UUID, site_id: UUID) -> PublishArtifactsOut:
        impact = await self.preview_impact(workspace_id=workspace_id, site_id=site_id)
        if _has_blockers(impact):
            raise Conflict(
                "Publish blocked by unresolved impact",
                error="PUBLISH_IMPACT_BLOCKING",
                meta=impact.model_dump(mode="json"),
            )

        items = await _load_publishable_items(workspace_id=workspace_id, site_id=site_id)
        route_map = await _load_active_route_map(site_id=site_id)
        item_ids = [item.id for item in items]
        version_map = await _load_published_versions(item_ids=item_ids)
        hierarchy_map = await _load_hierarchy_map(site_id=site_id)
        version_ids = [version.id for version in version_map.values()]
        seo_profile_map = await _load_seo_profile_map(version_ids=version_ids)
        component_binding_map = await _load_component_binding_map(version_ids=version_ids)
        rows: list[PublishedGraphRecord] = []
        artifact_rows: list[PublishArtifactRecord] = []
        for item in items:
            route = route_map[(item.id, item.locale)]
            version = version_map.get((item.id, int(item.published_version or 0)))
            if version is None:
                continue
            node = hierarchy_map.get(item.id)
            rows.append(
                PublishedGraphRecord(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=item.id,
                    version_id=version.id,
                    locale=route.locale,
                    route_path=route.path,
                    hierarchy_parent_item_id=node.parent_item_id if node is not None else None,
                    hierarchy_sort_order=node.sort_order if node is not None else 0,
                )
            )
            artifact_rows.append(
                PublishArtifactRecord(
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
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=item.id,
                    version_id=version.id,
                    artifact_kind=PublishArtifactKind.RENDER_HINTS,
                    locale=route.locale,
                    payload={
                        "modelKey": item.model_definition.key,
                        "capabilities": item.model_definition.capabilities or [],
                    },
                )
            )

            seo_profile = seo_profile_map.get(version.id)
            if seo_profile is not None:
                artifact_rows.append(
                    PublishArtifactRecord(
                        workspace_id=workspace_id,
                        site_id=site_id,
                        item_id=item.id,
                        version_id=version.id,
                        artifact_kind=PublishArtifactKind.SEO_METADATA,
                        locale=route.locale,
                        payload=seo_profile.payload,
                    )
                )

            bindings = component_binding_map.get(version.id, [])
            if bindings:
                artifact_rows.append(
                    PublishArtifactRecord(
                        workspace_id=workspace_id,
                        site_id=site_id,
                        item_id=item.id,
                        version_id=version.id,
                        artifact_kind=PublishArtifactKind.BINDING_MANIFEST,
                        locale=route.locale,
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

        async with in_transaction() as conn:
            await PublishedGraphRecord.filter(workspace_id=workspace_id, site_id=site_id).using_db(conn).delete()
            await PublishArtifactRecord.filter(workspace_id=workspace_id, site_id=site_id).using_db(conn).delete()
            if rows:
                await PublishedGraphRecord.bulk_create(rows, using_db=conn)
            if artifact_rows:
                await PublishArtifactRecord.bulk_create(artifact_rows, using_db=conn)
        return PublishArtifactsOut(graph_nodes=len(rows), impact=impact)
