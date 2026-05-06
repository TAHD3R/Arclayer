from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict, NotFound
from src.models.content._enums import PublishArtifactKind
from src.models.content.publish_artifact import PublishArtifactRecord
from src.models.projects.environment import ProjectEnvironmentKey
from src.modules.projects.deployments.service import ProjectDeploymentsService
from src.modules.projects.publish.schema import (
    PublishExportArtifactOut,
    PublishExportContractOut,
    PublishExportRoutePointerOut,
)
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.schema import TenantContext

_JSON_ARTIFACT_KIND = "json"


class _PublishArtifactBundle(BaseModel):
    item_id: UUID
    version_id: UUID
    locale: str
    route: JsonObject | None = None
    render_hints: JsonObject | None = None
    components: JsonObject | None = None
    seo: JsonObject | None = None
    bindings: JsonObject | None = None
    html: str | None = None


def _build_tenant_id(tenant_context: TenantContext) -> str:
    return tenant_context.schema_name


def _build_bundle_key(row: PublishArtifactRecord) -> tuple[UUID, UUID, str]:
    return (row.item_id, row.version_id, row.locale)


def _build_artifact_key(bundle: _PublishArtifactBundle) -> str:
    return f"{bundle.item_id}:{bundle.version_id}:{bundle.locale}"


def _coerce_payload(row: PublishArtifactRecord) -> JsonObject | None:
    if isinstance(row.payload, dict):
        return row.payload
    if row.payload is None:
        return None
    raise Conflict(
        "Publish artifact payload is invalid",
        error="PUBLISH_ARTIFACT_PAYLOAD_INVALID",
        meta={
            "itemId": str(row.item_id),
            "versionId": str(row.version_id),
            "locale": row.locale,
            "artifactKind": str(row.artifact_kind),
        },
    )


def _assign_bundle_payload(bundle: _PublishArtifactBundle, row: PublishArtifactRecord) -> None:
    payload = _coerce_payload(row)
    if row.artifact_kind == PublishArtifactKind.ROUTE_MANIFEST:
        bundle.route = payload
        return
    if row.artifact_kind == PublishArtifactKind.RENDER_HINTS:
        bundle.render_hints = payload
        return
    if row.artifact_kind == PublishArtifactKind.COMPONENT_MANIFEST:
        bundle.components = payload
        bundle.html = row.html
        return
    if row.artifact_kind == PublishArtifactKind.SEO_METADATA:
        bundle.seo = payload
        return
    if row.artifact_kind == PublishArtifactKind.BINDING_MANIFEST:
        bundle.bindings = payload


def _require_payload(
    *,
    bundle: _PublishArtifactBundle,
    payload: JsonObject | None,
    artifact_kind: PublishArtifactKind,
) -> JsonObject:
    if payload is not None:
        return payload
    raise Conflict(
        "Publish contract artifacts are incomplete",
        error="PUBLISH_CONTRACT_ARTIFACT_INCOMPLETE",
        meta={
            "itemId": str(bundle.item_id),
            "versionId": str(bundle.version_id),
            "locale": bundle.locale,
            "missingArtifactKind": artifact_kind.value,
        },
    )


def _route_path(bundle: _PublishArtifactBundle) -> str:
    route = _require_payload(
        bundle=bundle,
        payload=bundle.route,
        artifact_kind=PublishArtifactKind.ROUTE_MANIFEST,
    )
    path = route.get("path")
    if isinstance(path, str) and path.strip():
        return path
    raise Conflict(
        "Route manifest is invalid",
        error="PUBLISH_ROUTE_MANIFEST_INVALID",
        meta={"itemId": str(bundle.item_id), "versionId": str(bundle.version_id), "locale": bundle.locale},
    )


def _to_route_pointer(
    *,
    bundle: _PublishArtifactBundle,
    tenant_id: str,
) -> PublishExportRoutePointerOut:
    return PublishExportRoutePointerOut(
        tenant_id=tenant_id,
        locale=bundle.locale,
        path=_route_path(bundle),
        artifact_key=_build_artifact_key(bundle),
    )


def _to_artifact_payload(bundle: _PublishArtifactBundle) -> JsonObject:
    return {
        "itemId": str(bundle.item_id),
        "versionId": str(bundle.version_id),
        "locale": bundle.locale,
        "route": _require_payload(
            bundle=bundle,
            payload=bundle.route,
            artifact_kind=PublishArtifactKind.ROUTE_MANIFEST,
        ),
        "renderHints": _require_payload(
            bundle=bundle,
            payload=bundle.render_hints,
            artifact_kind=PublishArtifactKind.RENDER_HINTS,
        ),
        "components": _require_payload(
            bundle=bundle,
            payload=bundle.components,
            artifact_kind=PublishArtifactKind.COMPONENT_MANIFEST,
        ),
        "seo": bundle.seo,
        "bindings": bundle.bindings,
    }


def _to_contract_artifact(
    *,
    bundle: _PublishArtifactBundle,
    tenant_id: str,
) -> PublishExportArtifactOut:
    return PublishExportArtifactOut(
        tenant_id=tenant_id,
        artifact_key=_build_artifact_key(bundle),
        kind=_JSON_ARTIFACT_KIND,
        payload=_to_artifact_payload(bundle),
        html=bundle.html,
    )


def _new_bundle(row: PublishArtifactRecord) -> _PublishArtifactBundle:
    return _PublishArtifactBundle(item_id=row.item_id, version_id=row.version_id, locale=row.locale)


def _group_bundles(rows: list[PublishArtifactRecord]) -> list[_PublishArtifactBundle]:
    bundles: dict[tuple[UUID, UUID, str], _PublishArtifactBundle] = {}
    for row in rows:
        key = _build_bundle_key(row)
        bundle = bundles.get(key)
        if bundle is None:
            bundle = _new_bundle(row)
            bundles[key] = bundle
        _assign_bundle_payload(bundle, row)
    routed_bundles = [bundle for bundle in bundles.values() if bundle.route is not None]
    return sorted(routed_bundles, key=lambda bundle: (_route_path(bundle), bundle.locale))


class ProjectPublishArtifactStorage:
    def __init__(self, tenant_context: TenantContext) -> None:
        self._tenant_context = tenant_context
        self._tenant_db = TenantDatabaseRouter(tenant_context)
        self._deployments = ProjectDeploymentsService()

    async def _load_active_release_id(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        preview: bool,
    ) -> UUID:
        environment_key = ProjectEnvironmentKey.DEVELOPMENT if preview else ProjectEnvironmentKey.PRODUCTION
        release_id = await self._deployments.get_environment_release_id(
            site_id=site_id, environment_key=environment_key
        )
        if release_id is not None:
            return release_id
        raise NotFound(
            "Active deployment is required before reading publish contract",
            error="PROJECT_DEPLOYMENT_MISSING",
            meta={"workspaceId": str(workspace_id), "siteId": str(site_id), "preview": preview},
        )

    async def _load_artifact_rows(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        preview: bool,
    ) -> list[PublishArtifactRecord]:
        active_release_id = await self._load_active_release_id(
            workspace_id=workspace_id,
            site_id=site_id,
            preview=preview,
        )
        async with self._tenant_db.connection() as conn:
            rows = (
                await PublishArtifactRecord
                .filter(workspace_id=workspace_id, site_id=site_id, release_id=active_release_id)
                .using_db(conn)
                .order_by("item_id", "version_id", "locale", "artifact_kind")
                .all()
            )
        if rows:
            return rows
        raise NotFound(
            "Publish artifacts are required before reading publish contract",
            error="PUBLISH_ARTIFACTS_MISSING",
            meta={"workspaceId": str(workspace_id), "siteId": str(site_id), "releaseId": str(active_release_id)},
        )

    async def build_publish_contract(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        preview: bool = False,
    ) -> PublishExportContractOut:
        rows = await self._load_artifact_rows(workspace_id=workspace_id, site_id=site_id, preview=preview)
        bundles = _group_bundles(rows)
        tenant_id = _build_tenant_id(self._tenant_context)
        return PublishExportContractOut(
            route_pointers=[_to_route_pointer(bundle=bundle, tenant_id=tenant_id) for bundle in bundles],
            artifacts=[_to_contract_artifact(bundle=bundle, tenant_id=tenant_id) for bundle in bundles],
        )
