from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from tortoise.exceptions import IntegrityError
from tortoise.models import Model
from tortoise.transactions import in_transaction

from src.core.exceptions import Conflict, NotFound
from src.models.assets.asset import AssetRecord
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.model_field import ContentModelFieldRecord
from src.models.content.model_relation import ContentModelRelationRecord
from src.models.content.model_view import ContentModelViewRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.publish_artifact import PublishArtifactRecord
from src.models.content.published_graph import PublishedGraphRecord
from src.models.content.release import ContentReleaseRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.modules.projects.content.transfer.repository import ProjectContentTransferRepository
from src.modules.projects.content.transfer.schema import (
    TRANSFER_SCHEMA_VERSION,
    ContentTransferBundle,
    ContentTransferDiagnostic,
    ContentTransferExportResult,
    ContentTransferImportResult,
    ContentTransferManifest,
    ContentTransferPhase,
    ContentTransferProjectIdentity,
    ContentTransferResourceBundle,
    TransferResourceName,
)
from src.modules.tenancy.schema import TenantContext

_IMPORT_ORDER: tuple[tuple[TransferResourceName, type[Model]], ...] = (
    ("content_models", ContentModelDefinitionRecord),
    ("content_model_fields", ContentModelFieldRecord),
    ("content_model_relations", ContentModelRelationRecord),
    ("content_model_views", ContentModelViewRecord),
    ("content_items", ContentItemRecord),
    ("content_versions", ContentVersionRecord),
    ("presentation_documents", PresentationDocumentRecord),
    ("seo_profiles", SEOProfileRecord),
    ("component_bindings", ComponentBindingRecord),
    ("route_bindings", RouteBindingRecord),
    ("hierarchy_nodes", HierarchyNodeRecord),
    ("releases", ContentReleaseRecord),
    ("published_graph", PublishedGraphRecord),
    ("publish_artifacts", PublishArtifactRecord),
    ("assets", AssetRecord),
)


def _json_default(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", by_alias=False, exclude_none=False)
    return str(value)


def _checksum(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=_json_default)
    return sha256(payload.encode("utf-8")).hexdigest()


def _uuid(value: str) -> UUID:
    return UUID(value)


def _record_payload(record: Any, fields: Iterable[str]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for field in fields:
        payload[field] = getattr(record, field)
    return json.loads(json.dumps(payload, default=_json_default))


def _phase(key: str, *, resource: str | None = None, count: int = 0) -> ContentTransferPhase:
    return ContentTransferPhase(key=key, state="completed", resource=resource, count=count)


def _blocking(code: str, message: str, *, path: str | None = None, meta: dict[str, Any] | None = None):
    return ContentTransferDiagnostic(severity="blocking", code=code, message=message, path=path, meta=meta)


def _info(code: str, message: str, *, meta: dict[str, Any] | None = None) -> ContentTransferDiagnostic:
    return ContentTransferDiagnostic(severity="info", code=code, message=message, meta=meta)


class ProjectContentTransferService:
    def __init__(self, tenant_context: TenantContext) -> None:
        self.tenant_context = tenant_context
        self.repo = ProjectContentTransferRepository(tenant_context)

    async def export_project(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        site_id: UUID,
        runtime_id: UUID | None = None,
    ) -> ContentTransferExportResult:
        workspace = await self.repo.load_workspace(workspace_id=workspace_id)
        if workspace is None:
            raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")
        project = await self.repo.load_project(project_id=project_id)
        if project is None or project.workspace_id != workspace_id:
            raise NotFound("Project not found", error="PROJECT_NOT_FOUND")
        site = await self.repo.load_site(site_id=site_id)
        if site is None or site.workspace_id != workspace_id or site.project_id != project_id:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")
        runtime = await self.repo.load_runtime(project_id=project_id, runtime_id=runtime_id)
        if site.runtime_id is not None and runtime is not None and site.runtime_id != runtime.id:
            raise Conflict("Site runtime does not match transfer runtime", error="CONTENT_TRANSFER_RUNTIME_MISMATCH")

        resources = await self._export_resources(
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            workspace=workspace,
            project=project,
            site=site,
            runtime=runtime,
        )
        counts = self._resource_counts(resources)
        diagnostics = [
            _info(
                "CONTENT_TRANSFER_ASSET_METADATA_ONLY",
                "Asset transfer includes metadata records; binary object movement belongs to storage tooling.",
                meta={"assets": counts["assets"]},
            )
        ]
        phases = [
            _phase("load_identity", resource="project", count=1),
            _phase("export_schema", resource="content_models", count=counts["content_models"]),
            _phase("export_content", resource="content_items", count=counts["content_items"]),
            _phase("export_assets", resource="assets", count=counts["assets"]),
            _phase("build_manifest", resource="manifest", count=1),
        ]
        manifest = ContentTransferManifest(
            schema_version=TRANSFER_SCHEMA_VERSION,
            exported_at=datetime.now(UTC),
            project_identity=ContentTransferProjectIdentity(
                organization_id=str(workspace.organization_id),
                workspace_id=str(workspace.id),
                workspace_name=workspace.name,
                project_id=str(project.id),
                project_slug=project.slug,
                project_name=project.name,
                runtime_id=str(runtime.id) if runtime is not None else None,
                site_id=str(site.id),
                site_slug=site.slug,
                site_name=site.name,
                default_locale=site.default_locale,
                fallback_locale=site.fallback_locale,
            ),
            resource_counts=counts,
            integrity_checks=self._integrity_checks(resources),
            phases=phases,
            diagnostics=diagnostics,
        )
        bundle = ContentTransferBundle(manifest=manifest, resources=resources)
        return ContentTransferExportResult(bundle=bundle, diagnostics=diagnostics)

    async def validate_import(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        site_id: UUID,
        bundle: ContentTransferBundle,
    ) -> list[ContentTransferDiagnostic]:
        diagnostics = self._validate_manifest(bundle)
        identity = bundle.manifest.project_identity
        if identity.workspace_id != str(workspace_id):
            diagnostics.append(
                _blocking(
                    "CONTENT_TRANSFER_WORKSPACE_MISMATCH",
                    "Transfer manifest workspace does not match the import target.",
                    path="manifest.project_identity.workspace_id",
                    meta={"source": identity.workspace_id, "target": str(workspace_id)},
                )
            )
        if identity.project_id != str(project_id):
            diagnostics.append(
                _blocking(
                    "CONTENT_TRANSFER_PROJECT_MISMATCH",
                    "Transfer manifest project does not match the import target.",
                    path="manifest.project_identity.project_id",
                    meta={"source": identity.project_id, "target": str(project_id)},
                )
            )
        if identity.site_id != str(site_id):
            diagnostics.append(
                _blocking(
                    "CONTENT_TRANSFER_SITE_MISMATCH",
                    "Transfer manifest site does not match the import target.",
                    path="manifest.project_identity.site_id",
                    meta={"source": identity.site_id, "target": str(site_id)},
                )
            )
        if await self.repo.target_has_content(workspace_id=workspace_id, site_id=site_id):
            diagnostics.append(
                _blocking(
                    "CONTENT_TRANSFER_TARGET_NOT_EMPTY",
                    "Import target already has content models or content items.",
                    meta={"workspace_id": str(workspace_id), "site_id": str(site_id)},
                )
            )
        return diagnostics

    async def import_project(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        site_id: UUID,
        bundle: ContentTransferBundle,
    ) -> ContentTransferImportResult:
        diagnostics = await self.validate_import(
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            bundle=bundle,
        )
        if any(diagnostic.severity == "blocking" for diagnostic in diagnostics):
            raise Conflict(
                "Content transfer import validation failed",
                error="CONTENT_TRANSFER_IMPORT_BLOCKED",
                meta={"diagnostics": [item.model_dump(mode="json") for item in diagnostics]},
            )

        phases: list[ContentTransferPhase] = []
        try:
            async with in_transaction() as conn:
                await self.repo.tenant_db.bind(conn)
                for resource, model in _IMPORT_ORDER:
                    rows = getattr(bundle.resources, resource)
                    await self.repo.create_many(model, self._rewrite_target_identity(resource, rows), conn=conn)
                    phases.append(_phase(f"import_{resource}", resource=resource, count=len(rows)))
        except IntegrityError as exc:
            diagnostic = _blocking(
                "CONTENT_TRANSFER_IMPORT_CONFLICT",
                "Transfer import failed because target records conflict with existing data.",
                meta={"detail": str(exc)},
            )
            raise Conflict(
                "Content transfer import conflict",
                error="CONTENT_TRANSFER_IMPORT_CONFLICT",
                meta={"diagnostics": [diagnostic.model_dump(mode="json")]},
            ) from exc

        return ContentTransferImportResult(manifest=bundle.manifest, phases=phases, diagnostics=diagnostics)

    async def _export_resources(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        site_id: UUID,
        workspace,
        project,
        site,
        runtime,
    ) -> ContentTransferResourceBundle:
        models = await self.repo.load_content_models(workspace_id=workspace_id, site_id=site_id)
        model_ids = [row.id for row in models]
        items = await self.repo.load_content_items(workspace_id=workspace_id, site_id=site_id)
        item_ids = [row.id for row in items]
        versions = await self.repo.load_versions(item_ids=item_ids)
        version_ids = [row.id for row in versions]
        releases = await self.repo.load_releases(workspace_id=workspace_id, site_id=site_id)
        return ContentTransferResourceBundle(
            workspace=self._workspace_payload(workspace),
            project=self._project_payload(project),
            runtime=self._runtime_payload(runtime) if runtime is not None else None,
            site=self._site_payload(site),
            content_models=[self._model_payload(row) for row in models],
            content_model_fields=[
                self._model_field_payload(row) for row in await self.repo.load_model_fields(model_ids=model_ids)
            ],
            content_model_relations=[
                self._model_relation_payload(row) for row in await self.repo.load_model_relations(model_ids=model_ids)
            ],
            content_model_views=[
                self._model_view_payload(row) for row in await self.repo.load_model_views(model_ids=model_ids)
            ],
            content_items=[self._content_item_payload(row) for row in items],
            content_versions=[self._content_version_payload(row) for row in versions],
            presentation_documents=[
                self._presentation_payload(row)
                for row in await self.repo.load_presentation_documents(version_ids=version_ids)
            ],
            seo_profiles=[self._seo_payload(row) for row in await self.repo.load_seo_profiles(version_ids=version_ids)],
            component_bindings=[
                self._component_binding_payload(row)
                for row in await self.repo.load_component_bindings(version_ids=version_ids)
            ],
            route_bindings=[
                self._route_binding_payload(row)
                for row in await self.repo.load_route_bindings(workspace_id=workspace_id, site_id=site_id)
            ],
            hierarchy_nodes=[
                self._hierarchy_payload(row)
                for row in await self.repo.load_hierarchy_nodes(workspace_id=workspace_id, site_id=site_id)
            ],
            releases=[self._release_payload(row) for row in releases],
            published_graph=[
                self._published_graph_payload(row)
                for row in await self.repo.load_published_graph(workspace_id=workspace_id, site_id=site_id)
            ],
            publish_artifacts=[
                self._publish_artifact_payload(row)
                for row in await self.repo.load_publish_artifacts(workspace_id=workspace_id, site_id=site_id)
            ],
            assets=[
                self._asset_payload(row)
                for row in await self.repo.load_assets(workspace_id=workspace_id, project_id=project_id)
            ],
        )

    def _validate_manifest(self, bundle: ContentTransferBundle) -> list[ContentTransferDiagnostic]:
        diagnostics: list[ContentTransferDiagnostic] = []
        if bundle.manifest.schema_version != TRANSFER_SCHEMA_VERSION:
            diagnostics.append(
                _blocking(
                    "CONTENT_TRANSFER_SCHEMA_VERSION_UNSUPPORTED",
                    "Transfer manifest schema version is unsupported.",
                    path="manifest.schema_version",
                    meta={"schema_version": bundle.manifest.schema_version},
                )
            )
        current_counts = self._resource_counts(bundle.resources)
        for resource, expected in bundle.manifest.resource_counts.items():
            actual = current_counts.get(resource, 0)
            if actual != expected:
                diagnostics.append(
                    _blocking(
                        "CONTENT_TRANSFER_RESOURCE_COUNT_MISMATCH",
                        "Transfer resource count does not match the manifest.",
                        path=f"resources.{resource}",
                        meta={"resource": resource, "expected": expected, "actual": actual},
                    )
                )
        for key, expected in bundle.manifest.integrity_checks.items():
            actual = self._integrity_checks(bundle.resources).get(key)
            if actual != expected:
                diagnostics.append(
                    _blocking(
                        "CONTENT_TRANSFER_CHECKSUM_MISMATCH",
                        "Transfer resource checksum does not match the manifest.",
                        path=f"manifest.integrity_checks.{key}",
                        meta={"resource": key, "expected": expected, "actual": actual},
                    )
                )
        return diagnostics

    def _resource_counts(self, resources: ContentTransferResourceBundle) -> dict[TransferResourceName, int]:
        return {
            "workspace": 1 if resources.workspace else 0,
            "project": 1 if resources.project else 0,
            "runtime": 1 if resources.runtime else 0,
            "site": 1 if resources.site else 0,
            "content_models": len(resources.content_models),
            "content_model_fields": len(resources.content_model_fields),
            "content_model_relations": len(resources.content_model_relations),
            "content_model_views": len(resources.content_model_views),
            "content_items": len(resources.content_items),
            "content_versions": len(resources.content_versions),
            "presentation_documents": len(resources.presentation_documents),
            "seo_profiles": len(resources.seo_profiles),
            "component_bindings": len(resources.component_bindings),
            "route_bindings": len(resources.route_bindings),
            "hierarchy_nodes": len(resources.hierarchy_nodes),
            "releases": len(resources.releases),
            "published_graph": len(resources.published_graph),
            "publish_artifacts": len(resources.publish_artifacts),
            "assets": len(resources.assets),
        }

    def _integrity_checks(self, resources: ContentTransferResourceBundle) -> dict[str, str]:
        return {
            "workspace": _checksum(resources.workspace),
            "project": _checksum(resources.project),
            "runtime": _checksum(resources.runtime),
            "site": _checksum(resources.site),
            "content_models": _checksum(resources.content_models),
            "content_items": _checksum(resources.content_items),
            "content_versions": _checksum(resources.content_versions),
            "assets": _checksum(resources.assets),
            "releases": _checksum(resources.releases),
            "routes": _checksum({
                "route_bindings": resources.route_bindings,
                "hierarchy_nodes": resources.hierarchy_nodes,
                "published_graph": resources.published_graph,
            }),
        }

    def _rewrite_target_identity(
        self,
        resource: TransferResourceName,
        rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        rewritten = [dict(row) for row in rows]
        for row in rewritten:
            if "workspace_id" in row:
                row["workspace_id"] = self.tenant_context.workspace_id
            if (
                resource == "assets"
                and row.get("project_id") is not None
                and self.tenant_context.project_id is not None
            ):
                row["project_id"] = self.tenant_context.project_id
        return rewritten

    def _workspace_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "organization_id",
                "name",
                "kind",
                "owner_user_id",
                "description",
                "icon_mode",
                "icon_color",
                "icon_glyph",
                "icon_emoji",
                "icon_url",
                "is_active",
                "archived_at",
                "archived_by_user_id",
                "deleted_at",
                "created_by_user_id",
                "created_at",
                "updated_at",
            ),
        )

    def _project_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "workspace_id",
                "slug",
                "name",
                "description",
                "icon_mode",
                "icon_color",
                "icon_glyph",
                "icon_emoji",
                "icon_url",
                "is_active",
                "created_by_user_id",
                "created_at",
                "updated_at",
            ),
        )

    def _runtime_payload(self, record) -> dict[str, Any]:
        return _record_payload(record, ("id", "project_id", "kind", "name", "is_active", "created_at", "updated_at"))

    def _site_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "workspace_id",
                "project_id",
                "runtime_id",
                "slug",
                "name",
                "default_locale",
                "fallback_locale",
                "is_active",
                "created_by_user_id",
                "created_at",
                "updated_at",
            ),
        )

    def _model_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "workspace_id",
                "site_id",
                "singular_key",
                "plural_key",
                "name",
                "description",
                "category",
                "model_kind",
                "default_editor",
                "default_role",
                "default_posture",
                "default_surface",
                "starter_pack_policy",
                "surface_policy",
                "protocol_key",
                "protocol_version",
                "is_system_managed",
                "system_field_keys",
                "draft_contract_revision",
                "published_contract_revision",
                "published_contract_snapshot",
                "updated_by_user_id",
                "capabilities",
                "routing_policy",
                "presentation_policy",
                "seo_policy",
                "workflow_policy",
                "created_at",
                "updated_at",
            ),
        )

    def _model_field_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "model_definition_id",
                "key",
                "label",
                "field_type",
                "is_required",
                "default_value",
                "config",
                "sort_order",
                "created_at",
                "updated_at",
            ),
        )

    def _model_relation_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "model_definition_id",
                "target_model_definition_id",
                "target_model_key",
                "key",
                "relation_type",
                "is_required",
                "config",
                "sort_order",
                "created_at",
                "updated_at",
            ),
        )

    def _model_view_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "model_definition_id",
                "key",
                "label",
                "view_type",
                "dsl",
                "is_enabled",
                "sort_order",
                "created_at",
                "updated_at",
            ),
        )

    def _content_item_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "workspace_id",
                "site_id",
                "model_definition_id",
                "slug",
                "title",
                "status",
                "visibility",
                "locale",
                "bootstrap_preset_key",
                "bootstrap_preset_state",
                "capability_pack_ids",
                "resolved_role",
                "resolved_posture",
                "resolved_surface",
                "shape_state",
                "shape_reason_code",
                "shape_reason_meta",
                "workflow_stage",
                "workflow_assignee_user_id",
                "workflow_summary",
                "workflow_notes",
                "draft_version",
                "published_version",
                "created_by_user_id",
                "updated_by_user_id",
                "created_at",
                "updated_at",
            ),
        )

    def _content_version_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "item_id",
                "version",
                "state",
                "fields_snapshot",
                "change_summary",
                "created_by_user_id",
                "last_transition_by_user_id",
                "created_at",
                "updated_at",
            ),
        )

    def _presentation_payload(self, record) -> dict[str, Any]:
        return _record_payload(record, ("id", "version_id", "kind", "payload", "created_at", "updated_at"))

    def _seo_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "version_id",
                "meta_title",
                "meta_description",
                "canonical_url",
                "robots_directive",
                "payload",
                "created_at",
                "updated_at",
            ),
        )

    def _component_binding_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "version_id",
                "component_key",
                "binding_key",
                "binding_payload",
                "sort_order",
                "created_at",
                "updated_at",
            ),
        )

    def _route_binding_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "workspace_id",
                "site_id",
                "item_id",
                "locale",
                "path",
                "route_contract",
                "is_active",
                "created_at",
                "updated_at",
            ),
        )

    def _hierarchy_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            ("id", "workspace_id", "site_id", "item_id", "parent_item_id", "sort_order", "created_at", "updated_at"),
        )

    def _release_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "workspace_id",
                "site_id",
                "release_number",
                "is_active",
                "created_by_user_id",
                "activated_at",
                "lineage_parent_release_id",
                "selection_count",
                "created_at",
                "updated_at",
            ),
        )

    def _published_graph_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "release_id",
                "workspace_id",
                "site_id",
                "item_id",
                "version_id",
                "locale",
                "route_path",
                "route_contract",
                "hierarchy_parent_item_id",
                "hierarchy_sort_order",
                "created_at",
                "updated_at",
            ),
        )

    def _publish_artifact_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "release_id",
                "workspace_id",
                "site_id",
                "item_id",
                "version_id",
                "artifact_kind",
                "locale",
                "payload",
                "html",
                "created_at",
                "updated_at",
            ),
        )

    def _asset_payload(self, record) -> dict[str, Any]:
        return _record_payload(
            record,
            (
                "id",
                "workspace_id",
                "project_id",
                "organization_id",
                "user_id",
                "owner_user_id",
                "folder_id",
                "purpose",
                "visibility",
                "indexable",
                "title",
                "slug",
                "original_filename",
                "mime",
                "ext",
                "size_bytes",
                "checksum_sha256",
                "storage_provider",
                "storage_profile_key",
                "storage_bucket",
                "object_key",
                "variants",
                "meta",
                "deleted_at",
                "created_at",
                "updated_at",
            ),
        )
