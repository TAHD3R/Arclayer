from __future__ import annotations

from datetime import UTC, datetime
from typing import NoReturn, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SkipValidation, TypeAdapter, ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonValue
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.models.agents.runtime_v1 import AgentExecutionModeV1
from src.models.builder._enums import (
    BuilderApprovalClass,
    BuilderApprovalStatus,
    BuilderChangeSetStatus,
    BuilderProvenanceSource,
)
from src.models.builder.change_set import BuilderChangeSetApprovalRecord, BuilderChangeSetRecord
from src.models.sites.site import SiteRecord
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.projects.builder.change_set_context import require_builder_structure_revision
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetApplyRequest,
    BuilderGlobalSectionDeleteOperationV1,
    BuilderGlobalSectionIntentReplaceOperationV1,
    BuilderOperationV1,
    BuilderPageIntentReplaceOperationV1,
    BuilderRevisionRestoreOperationV1,
)
from src.modules.projects.builder.change_set_token import (
    builder_change_set_preview_token_hash,
    verify_builder_change_set_preview_token,
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
from src.modules.projects.builder.restore_change_set_context import (
    ResolvedBuilderRestoreTarget,
    resolve_builder_restore_target,
)
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.builder.snapshot import (
    BuilderSnapshotError,
    aggregate_presentation_hash,
    build_global_section_version_pins,
    build_page_version_pins,
    build_structure_snapshot,
    canonical_hash,
    select_page_versions,
)
from src.modules.projects.builder.visual_blueprint_documents import load_manifest_visual_blueprints
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1
from src.modules.projects.builder.wireframe_change_set_schema import BuilderWireframeTargetOperationV1
from src.modules.projects.builder.wireframe_documents import load_manifest_wireframes
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1

_OPERATIONS_ADAPTER = TypeAdapter(tuple[BuilderOperationV1, ...])


class BuilderChangeSetApplyContext(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, arbitrary_types_allowed=True)

    change_set: SkipValidation[BuilderChangeSetRecord]
    approval: SkipValidation[BuilderChangeSetApprovalRecord] | None
    site: SkipValidation[SiteRecord]
    base_manifest: SiteRevisionManifestV1
    base_structure: ContentStructureSnapshotV1
    base_structure_revision_number: int
    operations: tuple[BuilderOperationV1, ...]
    wireframes_by_item: dict[UUID, WireframeDocumentV1 | None]
    blueprints_by_item: dict[UUID, VisualBlueprintDocumentV1 | None] = Field(default_factory=dict)
    component_catalog: ComponentCatalogV1 | None
    design_contract: ResolvedBuilderDesignContract | None = None
    design_system_refresh: ResolvedBuilderDesignSystem | None
    restore_target: ResolvedBuilderRestoreTarget | None = None
    provenance_source: BuilderProvenanceSource
    now: datetime


async def resolve_builder_change_set_apply_context(
    *,
    repository: SiteBuilderRepository,
    agent_catalog_service: AgentCatalogService,
    design_system_repository: ProjectDesignSystemsRepository,
    component_catalog_resolver: ComponentCatalogResolver,
    settings: Settings,
    workspace_id: UUID,
    project_id: UUID,
    runtime_id: UUID,
    actor_user_id: UUID,
    change_set_id: UUID,
    payload: BuilderChangeSetApplyRequest,
    conn: BaseDBAsyncClient,
) -> BuilderChangeSetApplyContext:
    now = datetime.now(UTC)
    change_set = await repository.get_change_set(
        project_id=project_id,
        change_set_id=change_set_id,
        conn=conn,
        for_update=True,
    )
    if change_set is None or change_set.workspace_id != workspace_id:
        _raise_not_found("CHANGE_SET_NOT_FOUND")
    change_set_status = BuilderChangeSetStatus(str(change_set.status))
    if change_set_status is BuilderChangeSetStatus.APPLIED:
        _raise_conflict("CHANGE_SET_ALREADY_APPLIED")
    if change_set_status is not BuilderChangeSetStatus.PREVIEWED:
        _raise_conflict("CHANGE_SET_PREVIEW_REQUIRED")
    if change_set.expires_at <= now:
        _raise_conflict("CHANGE_SET_EXPIRED")
    claims = verify_builder_change_set_preview_token(settings, token=payload.preview_token, now=now)
    _require_token_identity(
        change_set=change_set,
        claims=claims,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        change_set_id=change_set_id,
        raw_token=payload.preview_token,
    )
    site = await repository.get_site(
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=change_set.site_id,
        conn=conn,
    )
    if site is None:
        _raise_not_found("BUILDER_SITE_NOT_FOUND")
    base_record = await repository.get_site_revision(
        project_id=project_id,
        revision_id=change_set.base_site_revision_id,
        conn=conn,
        for_update=True,
    )
    if base_record is None:
        _raise_not_found("SITE_REVISION_NOT_FOUND")
    base_manifest = parse_site_revision_manifest(base_record)
    latest = await repository.get_latest_site_revision(
        project_id=project_id,
        site_id=change_set.site_id,
        environment_id=change_set.environment_id,
        conn=conn,
        for_update=True,
    )
    if latest is None or latest.id != base_record.id or latest.manifest_hash != change_set.base_manifest_hash:
        _raise_conflict("SITE_REVISION_STALE")
    base_structure = await require_builder_structure_revision(
        repository=repository,
        workspace_id=workspace_id,
        project_id=project_id,
        manifest=base_manifest,
        conn=conn,
    )
    structure_record = await repository.get_structure_revision(
        project_id=project_id,
        revision_id=UUID(str(base_manifest.content_structure_revision_id)),
        conn=conn,
    )
    if structure_record is None:
        _raise_conflict("CONTENT_STRUCTURE_REVISION_MISSING")
    await _require_live_inputs_match_base(
        repository=repository,
        workspace_id=workspace_id,
        project_id=project_id,
        site=site,
        environment_id=change_set.environment_id,
        base_manifest=base_manifest,
        base_structure=base_structure,
        conn=conn,
    )
    operations = _parse_operations(change_set)
    restore_target = (
        await resolve_builder_restore_target(
            repository=repository,
            workspace_id=workspace_id,
            project_id=project_id,
            current_manifest=base_manifest,
            operation=operations[0],
            conn=conn,
        )
        if isinstance(operations[0], BuilderRevisionRestoreOperationV1)
        else None
    )
    wireframes_by_item = (
        await load_manifest_wireframes(
            repository=repository,
            manifest=base_manifest,
            structure=base_structure,
            conn=conn,
        )
        if isinstance(operations[0], (BuilderWireframeTargetOperationV1, BuilderDesignTargetOperationV1))
        or any(
            isinstance(
                operation,
                (
                    BuilderPageIntentReplaceOperationV1,
                    BuilderGlobalSectionDeleteOperationV1,
                    BuilderGlobalSectionIntentReplaceOperationV1,
                ),
            )
            for operation in operations
        )
        else {}
    )
    component_catalog = (
        await resolve_builder_component_catalog(
            repository=design_system_repository,
            resolver=component_catalog_resolver,
            workspace_id=workspace_id,
            manifest=base_manifest,
            conn=conn,
        )
        if isinstance(operations[0], BuilderWireframeTargetOperationV1)
        else None
    )
    blueprints_by_item = (
        await load_manifest_visual_blueprints(
            repository=repository,
            manifest=base_manifest,
            structure=base_structure,
            conn=conn,
        )
        if isinstance(operations[0], BuilderDesignTargetOperationV1)
        else {}
    )
    design_contract = (
        await resolve_builder_design_contract(
            repository=design_system_repository,
            resolver=component_catalog_resolver,
            workspace_id=workspace_id,
            manifest=base_manifest,
            conn=conn,
        )
        if isinstance(operations[0], BuilderDesignTargetOperationV1)
        else None
    )
    design_system_refresh = (
        await resolve_builder_design_system_refresh(
            repository=design_system_repository,
            component_catalog_resolver=component_catalog_resolver,
            workspace_id=workspace_id,
            project_id=project_id,
            operation=operations[0],
            conn=conn,
        )
        if isinstance(operations[0], BuilderDesignSystemRefreshOperationV1)
        else None
    )
    approval = await _require_approval(
        repository=repository,
        change_set=change_set,
        payload=payload,
        project_id=project_id,
        actor_user_id=actor_user_id,
        now=now,
        conn=conn,
    )
    provenance = BuilderProvenanceSource(str(change_set.provenance_source))
    await _require_agent_apply_authority(
        repository=repository,
        agent_catalog_service=agent_catalog_service,
        change_set=change_set,
        provenance=provenance,
        actor_user_id=actor_user_id,
        conn=conn,
    )
    return BuilderChangeSetApplyContext(
        change_set=change_set,
        approval=approval,
        site=site,
        base_manifest=base_manifest,
        base_structure=base_structure,
        base_structure_revision_number=int(structure_record.revision_number),
        operations=operations,
        wireframes_by_item=wireframes_by_item,
        blueprints_by_item=blueprints_by_item,
        component_catalog=component_catalog,
        design_contract=design_contract,
        design_system_refresh=design_system_refresh,
        restore_target=restore_target,
        provenance_source=provenance,
        now=now,
    )


def _require_token_identity(
    *,
    change_set: BuilderChangeSetRecord,
    claims,
    workspace_id: UUID,
    project_id: UUID,
    actor_user_id: UUID,
    change_set_id: UUID,
    raw_token: str,
) -> None:
    if (
        claims.change_set_id != change_set_id
        or claims.workspace_id != workspace_id
        or claims.project_id != project_id
        or claims.site_id != change_set.site_id
        or claims.environment_id != change_set.environment_id
        or claims.actor_user_id != actor_user_id
        or claims.base_revision_id != change_set.base_site_revision_id
        or claims.base_etag != change_set.base_manifest_hash
        or claims.operations_hash != change_set.operations_hash
        or claims.expires_at != change_set.expires_at
        or builder_change_set_preview_token_hash(raw_token) != change_set.preview_token_hash
    ):
        _raise_conflict("CHANGE_SET_PREVIEW_REQUIRED")


async def _require_live_inputs_match_base(
    *,
    repository: SiteBuilderRepository,
    workspace_id: UUID,
    project_id: UUID,
    site: SiteRecord,
    environment_id: UUID,
    base_manifest: SiteRevisionManifestV1,
    base_structure: ContentStructureSnapshotV1,
    conn: BaseDBAsyncClient,
) -> None:
    routes, hierarchy, items = await repository.list_structure_records(
        workspace_id=workspace_id,
        site_id=site.id,
        environment_id=environment_id,
        conn=conn,
    )
    global_items = await repository.list_global_section_records(
        workspace_id=workspace_id,
        site_id=site.id,
        environment_id=environment_id,
        conn=conn,
    )
    live_structure = build_structure_snapshot(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site.id,
        environment_id=environment_id,
        default_locale=str(site.default_locale),
        fallback_locale=str(site.fallback_locale),
        routes=routes,
        hierarchy=hierarchy,
        items=items,
        global_items=global_items,
        base_structure=base_structure,
    )
    structure_hash = canonical_hash(cast(JsonValue, live_structure.model_dump(mode="json", by_alias=True)))
    versions = await repository.list_content_versions(
        item_ids=[item.id for item in (*items, *global_items)],
        conn=conn,
    )
    try:
        selected = select_page_versions(items=items, versions=versions)
        selected_globals = select_page_versions(items=global_items, versions=versions)
    except BuilderSnapshotError:
        _raise_conflict("SITE_REVISION_STALE")
    presentations, bindings = await repository.list_presentations_and_bindings(
        version_ids=[record.id for record in (*selected.values(), *selected_globals.values())],
        conn=conn,
    )
    page_pins = build_page_version_pins(
        selected_versions=selected,
        presentations=presentations,
        bindings=bindings,
    )
    global_pins = build_global_section_version_pins(
        selected_versions=selected_globals,
        presentations=presentations,
        bindings=bindings,
    )
    if (
        structure_hash != base_manifest.content_structure_hash
        or page_pins != base_manifest.page_versions
        or global_pins != base_manifest.global_section_versions
        or aggregate_presentation_hash((*page_pins, *global_pins)) != base_manifest.presentation_set_hash
    ):
        _raise_conflict("SITE_REVISION_STALE")


async def _require_approval(
    *,
    repository: SiteBuilderRepository,
    change_set: BuilderChangeSetRecord,
    payload: BuilderChangeSetApplyRequest,
    project_id: UUID,
    actor_user_id: UUID,
    now: datetime,
    conn: BaseDBAsyncClient,
) -> BuilderChangeSetApprovalRecord | None:
    approval_class = BuilderApprovalClass(str(change_set.approval_class))
    if approval_class is BuilderApprovalClass.NONE:
        if payload.approval is not None:
            _raise_conflict("CHANGE_SET_APPROVAL_NOT_ALLOWED")
        return None
    decision = payload.approval
    if decision is None:
        _raise_conflict("CHANGE_SET_APPROVAL_REQUIRED")
    approval = await repository.get_change_set_approval(
        project_id=project_id,
        change_set_id=change_set.id,
        approval_id=UUID(str(decision.approval_id)),
        conn=conn,
        for_update=True,
    )
    if (
        approval is None
        or BuilderApprovalClass(str(decision.expected_approval_class)) is not approval_class
        or BuilderApprovalClass(str(approval.approval_class)) is not approval_class
        or BuilderApprovalStatus(str(approval.status)) is not BuilderApprovalStatus.PENDING
        or approval.operations_hash != change_set.operations_hash
        or approval.requested_by_user_id != change_set.actor_user_id
        or approval.expires_at != change_set.expires_at
    ):
        _raise_conflict("CHANGE_SET_APPROVAL_INVALID")
    if approval.expires_at <= now:
        _raise_conflict("CHANGE_SET_APPROVAL_EXPIRED")
    if decision.decision != "approve" or actor_user_id != change_set.actor_user_id:
        _raise_conflict("CHANGE_SET_APPROVAL_INVALID")
    return approval


async def _require_agent_apply_authority(
    *,
    repository: SiteBuilderRepository,
    agent_catalog_service: AgentCatalogService,
    change_set: BuilderChangeSetRecord,
    provenance: BuilderProvenanceSource,
    actor_user_id: UUID,
    conn: BaseDBAsyncClient,
) -> None:
    if provenance is not BuilderProvenanceSource.AGENT:
        return
    if change_set.tool_name is None:
        _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
    if change_set.agent_run_id is None:
        if change_set.agent_id is None or change_set.agent_version_id is None or change_set.agent_assignment_id is None:
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        resolved = await agent_catalog_service.resolve_lead(
            workspace_id=change_set.workspace_id,
            project_id=change_set.project_id,
            agent_id=change_set.agent_id,
            execution_mode="build",
            conn=conn,
            ensure_catalog=False,
        )
        if (
            resolved.agent_id != change_set.agent_id
            or resolved.version_id != change_set.agent_version_id
            or resolved.assignment_id != change_set.agent_assignment_id
        ):
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        if change_set.tool_name not in resolved.tool_grants:
            _raise_conflict("AGENT_BUILDER_TOOL_NOT_GRANTED")
        return
    run = await repository.get_agent_run_for_builder(
        run_id=change_set.agent_run_id,
        workspace_id=change_set.workspace_id,
        project_id=change_set.project_id,
        actor_user_id=actor_user_id,
        conn=conn,
    )
    if (
        run is None
        or run.site_revision_id != change_set.base_site_revision_id
        or AgentExecutionModeV1(str(run.execution_mode)) is not AgentExecutionModeV1.BUILD
        or run.lead_agent_version_id is None
    ):
        _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
    version = await repository.get_agent_version_for_builder(version_id=run.lead_agent_version_id, conn=conn)
    grants = set(version.tool_grants) if version is not None and isinstance(version.tool_grants, list) else set()
    if change_set.tool_name not in grants:
        _raise_conflict("AGENT_BUILDER_TOOL_NOT_GRANTED")


def _parse_operations(change_set: BuilderChangeSetRecord) -> tuple[BuilderOperationV1, ...]:
    try:
        operations = _OPERATIONS_ADAPTER.validate_python(change_set.operations)
    except ValidationError:
        _raise_conflict("BUILDER_OPERATION_INVALID")
    operations_hash = canonical_hash(
        cast(JsonValue, [item.model_dump(mode="json", by_alias=True) for item in operations])
    )
    if operations_hash != change_set.operations_hash:
        _raise_conflict("BUILDER_OPERATION_INVALID")
    return operations


def _raise_not_found(code: str) -> NoReturn:
    raise NotFound(error=code, message=t("errors", code))


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = ["BuilderChangeSetApplyContext", "resolve_builder_change_set_apply_context"]
