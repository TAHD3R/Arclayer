from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import NoReturn, cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.builder._enums import BuilderProvenanceSource, SiteRevisionLifecycleStatus
from src.models.projects._enums import ProjectAuthoringMode
from src.models.projects.environment import ProjectEnvironmentRecord
from src.models.projects.project import ProjectRecord
from src.models.sites.site import SiteRecord
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.projects.builder.design_system_context import ResolvedBuilderDesignSystem
from src.modules.projects.builder.manifest import (
    RootSiteRevisionManifestInput,
    build_root_site_revision_manifest,
)
from src.modules.projects.builder.projection import project_authoring_authority, site_revision_status_out
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    BuilderInitializationOut,
    BuilderInitializationRequest,
    ContentStructureRevisionOut,
    SiteRevisionFindingV1,
    SiteRevisionStatusOut,
)
from src.modules.projects.builder.snapshot import (
    BuilderSnapshotError,
    aggregate_presentation_hash,
    build_global_section_version_pins,
    build_page_version_pins,
    build_structure_snapshot,
    canonical_hash,
    select_page_versions,
)

ActivityWriter = Callable[..., Awaitable[object]]
_BUILDER_VALIDATOR_VERSION = "builder-foundation-v1"


class BaselineInitializationContext(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid", frozen=True)

    organization_id: UUID
    workspace_id: UUID
    project_id: UUID
    site: SiteRecord
    environment: ProjectEnvironmentRecord
    project: ProjectRecord
    design_system: ResolvedBuilderDesignSystem
    actor_user_id: UUID
    payload: BuilderInitializationRequest


async def create_root_builder_baseline(
    *,
    repository: SiteBuilderRepository,
    settings: Settings,
    activity_writer: ActivityWriter,
    context: BaselineInitializationContext,
    conn: BaseDBAsyncClient,
) -> BuilderInitializationOut:
    site = context.site
    environment = context.environment
    assignment = context.design_system.assignment
    payload = context.payload
    routes, hierarchy, items = await repository.list_structure_records(
        workspace_id=context.workspace_id,
        site_id=site.id,
        environment_id=environment.id,
        conn=conn,
    )
    global_items = await repository.list_global_section_records(
        workspace_id=context.workspace_id,
        site_id=site.id,
        environment_id=environment.id,
        conn=conn,
    )
    structure_snapshot = build_structure_snapshot(
        workspace_id=context.workspace_id,
        project_id=context.project_id,
        site_id=site.id,
        environment_id=environment.id,
        default_locale=str(site.default_locale),
        fallback_locale=str(site.fallback_locale),
        routes=routes,
        hierarchy=hierarchy,
        items=items,
        global_items=global_items,
    )
    structure_hash = canonical_hash(cast(JsonValue, structure_snapshot.model_dump(mode="json", by_alias=True)))
    versions = await repository.list_content_versions(
        item_ids=[item.id for item in (*items, *global_items)],
        conn=conn,
    )
    try:
        selected_versions = select_page_versions(items=items, versions=versions)
        selected_global_versions = select_page_versions(items=global_items, versions=versions)
    except BuilderSnapshotError as exc:
        _raise_conflict(exc.code)
    selected_ids = [record.id for record in (*selected_versions.values(), *selected_global_versions.values())]
    presentations, bindings = await repository.list_presentations_and_bindings(
        version_ids=selected_ids,
        conn=conn,
    )
    page_pins = build_page_version_pins(
        selected_versions=selected_versions,
        presentations=presentations,
        bindings=bindings,
    )
    global_section_pins = build_global_section_version_pins(
        selected_versions=selected_global_versions,
        presentations=presentations,
        bindings=bindings,
    )
    presentation_set_hash = aggregate_presentation_hash((*page_pins, *global_section_pins))
    now = datetime.now(UTC)
    structure_id = uuid7()
    structure_record = await repository.create_structure_revision(
        values={
            "id": structure_id,
            "created_at": now,
            "workspace_id": context.workspace_id,
            "project_id": context.project_id,
            "site_id": site.id,
            "environment_id": environment.id,
            "revision_number": 1,
            "parent_revision_id": None,
            "schema_version": 1,
            "structure_hash": structure_hash,
            "structure_snapshot": structure_snapshot.model_dump(mode="json", by_alias=True),
            "provenance_source": BuilderProvenanceSource(payload.provenance_source),
            "actor_user_id": context.actor_user_id,
            "agent_run_id": payload.agent_run_id,
            "correlation_id": correlation_id.get(None),
        },
        conn=conn,
    )
    manifest = build_root_site_revision_manifest(
        RootSiteRevisionManifestInput(
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            site_id=site.id,
            environment_id=environment.id,
            content_structure_revision_id=structure_id,
            content_structure_hash=structure_hash,
            page_versions=page_pins,
            global_section_versions=global_section_pins,
            presentation_set_hash=presentation_set_hash,
            design_system_id=assignment.design_system_id,
            design_system_version_id=assignment.design_system_version_id,
            design_system_manifest_checksum=assignment.manifest_checksum,
            provenance_source=BuilderProvenanceSource(payload.provenance_source),
            actor_user_id=context.actor_user_id,
            agent_run_id=payload.agent_run_id,
            correlation_id=correlation_id.get(None),
            created_at=now,
        )
    )
    site_revision = await repository.create_site_revision(
        values={
            "id": manifest.id,
            "created_at": now,
            "workspace_id": context.workspace_id,
            "project_id": context.project_id,
            "site_id": site.id,
            "environment_id": environment.id,
            "revision_number": 1,
            "base_revision_id": None,
            "manifest_version": 1,
            "authoring_mode": ProjectAuthoringMode.BUILDER_MANAGED,
            "content_structure_revision_id": structure_id,
            "content_structure_hash": structure_hash,
            "design_system_id": assignment.design_system_id,
            "design_system_version_id": assignment.design_system_version_id,
            "design_system_manifest_checksum": assignment.manifest_checksum,
            "page_version_pins": [pin.model_dump(mode="json", by_alias=True) for pin in page_pins],
            "global_section_version_pins": [pin.model_dump(mode="json", by_alias=True) for pin in global_section_pins],
            "presentation_set_hash": presentation_set_hash,
            "manifest_hash": manifest.manifest_hash,
            "manifest_snapshot": manifest.model_dump(mode="json", by_alias=True),
            "provenance_source": BuilderProvenanceSource(payload.provenance_source),
            "actor_user_id": context.actor_user_id,
            "agent_run_id": payload.agent_run_id,
            "correlation_id": correlation_id.get(None),
        },
        conn=conn,
    )
    status = await _create_initial_status(
        repository=repository,
        site_revision_id=site_revision.id,
        validation=context.design_system.validation,
        page_count=len(structure_snapshot.pages),
        now=now,
        conn=conn,
    )
    result = BuilderInitializationOut(
        authoring_authority=project_authoring_authority(context.project),
        content_structure_revision=ContentStructureRevisionOut(
            id=structure_record.id,
            revision_number=structure_record.revision_number,
            parent_revision_id=structure_record.parent_revision_id,
            structure_hash=structure_record.structure_hash,
            snapshot=structure_snapshot,
            created_at=structure_record.created_at,
        ),
        site_revision=manifest,
        status=status,
    )
    await _write_activity(
        settings=settings,
        activity_writer=activity_writer,
        context=context,
        result=result,
        conn=conn,
    )
    return result


async def _create_initial_status(
    *,
    repository: SiteBuilderRepository,
    site_revision_id: UUID,
    validation,
    page_count: int,
    now: datetime,
    conn: BaseDBAsyncClient,
) -> SiteRevisionStatusOut:
    findings = _initial_findings(validation=validation, page_count=page_count)
    status_payload: JsonObject = {
        "siteRevisionId": str(site_revision_id),
        "status": SiteRevisionLifecycleStatus.DRAFT.value,
        "statusRevision": 1,
        "readinessFindings": [item.model_dump(mode="json", by_alias=True) for item in findings],
        "validatorVersion": _BUILDER_VALIDATOR_VERSION,
        "calculatedAt": now.isoformat(),
    }
    record = await repository.create_status(
        values={
            "site_revision_id": site_revision_id,
            "status": SiteRevisionLifecycleStatus.DRAFT,
            "status_revision": 1,
            "readiness_findings": status_payload["readinessFindings"],
            "validator_version": _BUILDER_VALIDATOR_VERSION,
            "etag": canonical_hash(cast(JsonValue, status_payload)),
            "calculated_at": now,
        },
        conn=conn,
    )
    return site_revision_status_out(record)


async def _write_activity(
    *,
    settings: Settings,
    activity_writer: ActivityWriter,
    context: BaselineInitializationContext,
    result: BuilderInitializationOut,
    conn: BaseDBAsyncClient,
) -> None:
    await activity_writer(
        settings=settings,
        payload=ActivityAuditPayload(
            event_name="project.builder.initialized",
            organization_id=context.organization_id,
            workspace_id=context.workspace_id,
            actor_user_id=context.actor_user_id,
            entity_type="site_revision",
            entity_id=result.site_revision.id,
            source="api",
            properties={
                "projectId": str(context.project_id),
                "siteRevisionId": str(result.site_revision.id),
                "contentStructureRevisionId": str(result.content_structure_revision.id),
                "manifestHash": result.site_revision.manifest_hash,
                "revisionNumber": result.site_revision.revision_number,
            },
        ),
        conn=conn,
    )


def _initial_findings(*, validation, page_count: int) -> tuple[SiteRevisionFindingV1, ...]:
    findings: list[SiteRevisionFindingV1] = []
    if page_count == 0:
        findings.append(
            SiteRevisionFindingV1(
                category="content",
                severity="info",
                code="BUILDER_SITE_EMPTY",
                message_key="BUILDER_SITE_EMPTY",
            )
        )
    compatibility = validation.compatibility if isinstance(validation.compatibility, dict) else {}
    if compatibility.get("renderer") != "ready":
        findings.append(
            SiteRevisionFindingV1(
                category="design",
                severity="blocker",
                code="DESIGN_SYSTEM_RENDERER_NOT_READY",
                message_key="DESIGN_SYSTEM_RENDERER_NOT_READY",
                meta={"renderer": str(compatibility.get("renderer") or "not_evaluated")},
            )
        )
    if not bool(validation.publish_ready):
        findings.append(
            SiteRevisionFindingV1(
                category="design",
                severity="blocker",
                code="DESIGN_SYSTEM_PUBLICATION_NOT_READY",
                message_key="DESIGN_SYSTEM_PUBLICATION_NOT_READY",
            )
        )
    return tuple(findings)


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = [
    "ActivityWriter",
    "BaselineInitializationContext",
    "create_root_builder_baseline",
]
