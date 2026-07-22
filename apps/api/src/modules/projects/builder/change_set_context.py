from __future__ import annotations

from typing import NoReturn, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonValue
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.models.agents.runtime_v1 import AgentExecutionModeV1
from src.models.builder._enums import BuilderProvenanceSource
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetPreviewRequest,
    BuilderGlobalSectionDeleteOperationV1,
    BuilderGlobalSectionIntentReplaceOperationV1,
    BuilderPageIntentReplaceOperationV1,
)
from src.modules.projects.builder.component_catalog_context import resolve_builder_component_catalog
from src.modules.projects.builder.design_change_set_schema import BuilderDesignTargetOperationV1
from src.modules.projects.builder.design_contract_context import (
    ResolvedBuilderDesignContract,
    resolve_builder_design_contract,
)
from src.modules.projects.builder.design_system_change_set_schema import (
    BuilderDesignSystemRefreshOperationV1,
)
from src.modules.projects.builder.design_system_context import (
    ResolvedBuilderDesignSystem,
    resolve_builder_design_system_refresh,
)
from src.modules.projects.builder.manifest import parse_site_revision_manifest
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.visual_blueprint_documents import load_manifest_visual_blueprints
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1
from src.modules.projects.builder.wireframe_change_set_schema import BuilderWireframeTargetOperationV1
from src.modules.projects.builder.wireframe_documents import load_manifest_wireframes
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1


class ResolvedBuilderAgentProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    agent_run_id: UUID | None
    agent_id: UUID
    agent_version_id: UUID
    agent_assignment_id: UUID
    tool_name: str


class BuilderChangeSetPreviewContext(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    site_id: UUID
    environment_id: UUID
    manifest: SiteRevisionManifestV1
    structure: ContentStructureSnapshotV1
    provenance: BuilderProvenanceSource
    agent_provenance: ResolvedBuilderAgentProvenance | None
    wireframes_by_item: dict[UUID, WireframeDocumentV1 | None]
    blueprints_by_item: dict[UUID, VisualBlueprintDocumentV1 | None]
    component_catalog: ComponentCatalogV1 | None
    design_contract: ResolvedBuilderDesignContract | None
    design_system_refresh: ResolvedBuilderDesignSystem | None


async def resolve_builder_agent_provenance(
    *,
    repository: SiteBuilderRepository,
    agent_catalog_service: AgentCatalogService,
    provenance: BuilderProvenanceSource,
    workspace_id: UUID,
    project_id: UUID,
    actor_user_id: UUID,
    base_revision_id: UUID,
    payload: BuilderChangeSetPreviewRequest,
    conn: BaseDBAsyncClient,
) -> ResolvedBuilderAgentProvenance | None:
    if provenance is not BuilderProvenanceSource.AGENT:
        return None
    if payload.tool_name is None:
        _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
    if payload.agent_id is not None:
        resolved = await agent_catalog_service.resolve_lead(
            workspace_id=workspace_id,
            project_id=project_id,
            agent_id=UUID(str(payload.agent_id)),
            execution_mode="build",
            conn=conn,
            ensure_catalog=False,
        )
        if payload.tool_name not in resolved.tool_grants:
            _raise_conflict("AGENT_BUILDER_TOOL_NOT_GRANTED")
        return ResolvedBuilderAgentProvenance(
            agent_run_id=None,
            agent_id=resolved.agent_id,
            agent_version_id=resolved.version_id,
            agent_assignment_id=resolved.assignment_id,
            tool_name=payload.tool_name,
        )
    if payload.agent_run_id is None:
        _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
    run_id = UUID(str(payload.agent_run_id))
    run = await repository.get_agent_run_for_builder(
        run_id=run_id,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        conn=conn,
    )
    if (
        run is None
        or run.site_revision_id != base_revision_id
        or AgentExecutionModeV1(str(run.execution_mode)) is not AgentExecutionModeV1.BUILD
        or run.lead_agent_id is None
        or run.lead_agent_version_id is None
        or run.lead_agent_assignment_id is None
    ):
        _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
    return ResolvedBuilderAgentProvenance(
        agent_run_id=run_id,
        agent_id=UUID(str(run.lead_agent_id)),
        agent_version_id=run.lead_agent_version_id,
        agent_assignment_id=run.lead_agent_assignment_id,
        tool_name=payload.tool_name,
    )


async def resolve_builder_change_set_preview_context(
    *,
    repository: SiteBuilderRepository,
    agent_catalog_service: AgentCatalogService,
    design_system_repository: ProjectDesignSystemsRepository,
    component_catalog_resolver: ComponentCatalogResolver,
    workspace_id: UUID,
    project_id: UUID,
    runtime_id: UUID,
    actor_user_id: UUID,
    payload: BuilderChangeSetPreviewRequest,
    conn: BaseDBAsyncClient,
) -> BuilderChangeSetPreviewContext:
    site = await repository.get_site(
        project_id=project_id,
        runtime_id=runtime_id,
        conn=conn,
    )
    if site is None:
        _raise_not_found("BUILDER_SITE_NOT_FOUND")
    environment = await repository.get_default_preview_environment(
        project_id=project_id,
        conn=conn,
    )
    if environment is None:
        _raise_not_found("BUILDER_ENVIRONMENT_NOT_FOUND")
    manifest = await _require_current_manifest(
        repository=repository,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site.id,
        environment_id=environment.id,
        payload=payload,
        conn=conn,
    )
    structure = await require_builder_structure_revision(
        repository=repository,
        workspace_id=workspace_id,
        project_id=project_id,
        manifest=manifest,
        conn=conn,
    )
    provenance = BuilderProvenanceSource(payload.provenance_source)
    agent_provenance = await resolve_builder_agent_provenance(
        repository=repository,
        agent_catalog_service=agent_catalog_service,
        provenance=provenance,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        base_revision_id=UUID(str(manifest.id)),
        payload=payload,
        conn=conn,
    )
    wireframes_by_item = (
        await load_manifest_wireframes(
            repository=repository,
            manifest=manifest,
            structure=structure,
            conn=conn,
        )
        if isinstance(payload.operations[0], (BuilderWireframeTargetOperationV1, BuilderDesignTargetOperationV1))
        or any(
            isinstance(
                operation,
                (
                    BuilderPageIntentReplaceOperationV1,
                    BuilderGlobalSectionDeleteOperationV1,
                    BuilderGlobalSectionIntentReplaceOperationV1,
                ),
            )
            for operation in payload.operations
        )
        else {}
    )
    component_catalog = (
        await resolve_builder_component_catalog(
            repository=design_system_repository,
            resolver=component_catalog_resolver,
            workspace_id=workspace_id,
            manifest=manifest,
            conn=conn,
        )
        if isinstance(payload.operations[0], BuilderWireframeTargetOperationV1)
        else None
    )
    blueprints_by_item = (
        await load_manifest_visual_blueprints(
            repository=repository,
            manifest=manifest,
            structure=structure,
            conn=conn,
        )
        if isinstance(payload.operations[0], BuilderDesignTargetOperationV1)
        else {}
    )
    design_contract = (
        await resolve_builder_design_contract(
            repository=design_system_repository,
            resolver=component_catalog_resolver,
            workspace_id=workspace_id,
            manifest=manifest,
            conn=conn,
        )
        if isinstance(payload.operations[0], BuilderDesignTargetOperationV1)
        else None
    )
    design_system_refresh = (
        await resolve_builder_design_system_refresh(
            repository=design_system_repository,
            component_catalog_resolver=component_catalog_resolver,
            workspace_id=workspace_id,
            project_id=project_id,
            operation=payload.operations[0],
            conn=conn,
        )
        if isinstance(payload.operations[0], BuilderDesignSystemRefreshOperationV1)
        else None
    )
    return BuilderChangeSetPreviewContext(
        site_id=site.id,
        environment_id=environment.id,
        manifest=manifest,
        structure=structure,
        provenance=provenance,
        agent_provenance=agent_provenance,
        wireframes_by_item=wireframes_by_item,
        blueprints_by_item=blueprints_by_item,
        component_catalog=component_catalog,
        design_contract=design_contract,
        design_system_refresh=design_system_refresh,
    )


async def _require_current_manifest(
    *,
    repository: SiteBuilderRepository,
    workspace_id: UUID,
    project_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    payload: BuilderChangeSetPreviewRequest,
    conn: BaseDBAsyncClient,
) -> SiteRevisionManifestV1:
    base = await repository.get_site_revision(
        project_id=project_id,
        revision_id=UUID(str(payload.base_revision_id)),
        conn=conn,
    )
    if base is None:
        _raise_not_found("SITE_REVISION_NOT_FOUND")
    manifest = parse_site_revision_manifest(base)
    if (
        UUID(str(manifest.workspace_id)) != workspace_id
        or UUID(str(manifest.site_id)) != site_id
        or UUID(str(manifest.environment_id)) != environment_id
    ):
        _raise_not_found("SITE_REVISION_NOT_FOUND")
    latest = await repository.get_latest_site_revision(
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        conn=conn,
        for_update=True,
    )
    if (
        latest is None
        or latest.id != base.id
        or manifest.manifest_hash != payload.base_etag
        or latest.manifest_hash != payload.base_etag
    ):
        _raise_conflict("SITE_REVISION_STALE")
    return manifest


async def require_builder_structure_revision(
    *,
    repository: SiteBuilderRepository,
    workspace_id: UUID,
    project_id: UUID,
    manifest: SiteRevisionManifestV1,
    conn: BaseDBAsyncClient,
) -> ContentStructureSnapshotV1:
    record = await repository.get_structure_revision(
        project_id=project_id,
        revision_id=UUID(str(manifest.content_structure_revision_id)),
        conn=conn,
    )
    if record is None:
        _raise_conflict("CONTENT_STRUCTURE_REVISION_MISSING")
    try:
        snapshot = ContentStructureSnapshotV1.model_validate(record.structure_snapshot)
    except ValidationError:
        _raise_conflict("CONTENT_STRUCTURE_INVALID")
    snapshot_hash = canonical_hash(cast(JsonValue, snapshot.model_dump(mode="json", by_alias=True)))
    if (
        record.workspace_id != workspace_id
        or record.site_id != UUID(str(manifest.site_id))
        or record.environment_id != UUID(str(manifest.environment_id))
        or record.structure_hash != snapshot_hash
        or manifest.content_structure_hash != snapshot_hash
    ):
        _raise_conflict("CONTENT_STRUCTURE_INVALID")
    return snapshot


def _raise_not_found(code: str) -> NoReturn:
    raise NotFound(error=code, message=t("errors", code))


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = [
    "BuilderChangeSetPreviewContext",
    "ResolvedBuilderAgentProvenance",
    "require_builder_structure_revision",
    "resolve_builder_agent_provenance",
    "resolve_builder_change_set_preview_context",
]
