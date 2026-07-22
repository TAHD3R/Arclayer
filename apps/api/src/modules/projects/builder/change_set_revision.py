from __future__ import annotations

from datetime import UTC, datetime
from typing import NoReturn, cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.common.utils.ids import uuid7
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.builder._enums import BuilderProvenanceSource, SiteRevisionLifecycleStatus
from src.modules.projects.builder.manifest import NextSiteRevisionManifestInput, build_next_site_revision_manifest
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    BuilderPagePlanningV1,
    ContentStructureRevisionOut,
    ContentStructureSnapshotV1,
    SiteRevisionManifestV1,
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

_BUILDER_VALIDATOR_VERSION = "builder-foundation-v1"
_EMPTY_SITE_FINDING: JsonObject = {
    "category": "content",
    "severity": "info",
    "code": "BUILDER_SITE_EMPTY",
    "messageKey": "BUILDER_SITE_EMPTY",
    "meta": {},
}


class AppliedBuilderRevision(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    content_structure_revision: ContentStructureRevisionOut
    site_revision: SiteRevisionManifestV1


async def create_next_builder_revision(
    *,
    repository: SiteBuilderRepository,
    workspace_id: UUID,
    project_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    default_locale: str,
    fallback_locale: str,
    base_manifest: SiteRevisionManifestV1,
    base_structure: ContentStructureSnapshotV1,
    base_structure_revision_number: int,
    planning_overrides: dict[UUID, BuilderPagePlanningV1],
    provenance_source: BuilderProvenanceSource,
    actor_user_id: UUID,
    agent_run_id: UUID | None,
    agent_id: UUID | None,
    agent_version_id: UUID | None,
    agent_assignment_id: UUID | None,
    conn: BaseDBAsyncClient,
) -> AppliedBuilderRevision:
    structure = await _snapshot_current_structure(
        repository=repository,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        default_locale=default_locale,
        fallback_locale=fallback_locale,
        base_structure=base_structure,
        planning_overrides=planning_overrides,
        conn=conn,
    )
    structure_hash = canonical_hash(cast(JsonValue, structure.model_dump(mode="json", by_alias=True)))
    routes, hierarchy, items = await repository.list_structure_records(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        conn=conn,
    )
    global_items = await repository.list_global_section_records(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        conn=conn,
    )
    versions = await repository.list_content_versions(
        item_ids=[item.id for item in (*items, *global_items)],
        conn=conn,
    )
    try:
        selected = select_page_versions(items=items, versions=versions)
        selected_globals = select_page_versions(items=global_items, versions=versions)
    except BuilderSnapshotError as exc:
        _raise_conflict(exc.code)
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
    presentation_hash = aggregate_presentation_hash((*page_pins, *global_pins))
    now = datetime.now(UTC)
    structure_id = uuid7()
    structure_record = await repository.create_structure_revision(
        values={
            "id": structure_id,
            "created_at": now,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "site_id": site_id,
            "environment_id": environment_id,
            "revision_number": base_structure_revision_number + 1,
            "parent_revision_id": base_manifest.content_structure_revision_id,
            "schema_version": 1,
            "structure_hash": structure_hash,
            "structure_snapshot": structure.model_dump(mode="json", by_alias=True),
            "provenance_source": provenance_source,
            "actor_user_id": actor_user_id,
            "agent_run_id": agent_run_id,
            "agent_id": agent_id,
            "agent_version_id": agent_version_id,
            "agent_assignment_id": agent_assignment_id,
            "correlation_id": correlation_id.get(None),
        },
        conn=conn,
    )
    manifest = build_next_site_revision_manifest(
        NextSiteRevisionManifestInput(
            base=base_manifest,
            content_structure_revision_id=structure_id,
            content_structure_hash=structure_hash,
            page_versions=page_pins,
            global_section_versions=global_pins,
            presentation_set_hash=presentation_hash,
            design_system_id=UUID(str(base_manifest.design_system_id)),
            design_system_version_id=UUID(str(base_manifest.design_system_version_id)),
            design_system_manifest_checksum=base_manifest.design_system_manifest_checksum,
            provenance_source=provenance_source,
            actor_user_id=actor_user_id,
            agent_run_id=agent_run_id,
            agent_id=agent_id,
            agent_version_id=agent_version_id,
            agent_assignment_id=agent_assignment_id,
            correlation_id=correlation_id.get(None),
            created_at=now,
        )
    )
    await _persist_site_revision(
        repository=repository,
        manifest=manifest,
        base_manifest=base_manifest,
        provenance_source=provenance_source,
        actor_user_id=actor_user_id,
        agent_run_id=agent_run_id,
        agent_id=agent_id,
        agent_version_id=agent_version_id,
        agent_assignment_id=agent_assignment_id,
        now=now,
        conn=conn,
    )
    await _supersede_base_and_create_draft_status(
        repository=repository,
        base_revision_id=UUID(str(base_manifest.id)),
        next_revision_id=UUID(str(manifest.id)),
        page_count=len(structure.pages),
        now=now,
        conn=conn,
    )
    return AppliedBuilderRevision(
        content_structure_revision=ContentStructureRevisionOut(
            id=structure_record.id,
            revision_number=structure_record.revision_number,
            parent_revision_id=structure_record.parent_revision_id,
            structure_hash=structure_record.structure_hash,
            snapshot=structure,
            created_at=structure_record.created_at,
        ),
        site_revision=manifest,
    )


async def create_design_system_refresh_revision(
    *,
    repository: SiteBuilderRepository,
    base_manifest: SiteRevisionManifestV1,
    base_structure: ContentStructureSnapshotV1,
    design_system_id: UUID,
    design_system_version_id: UUID,
    design_system_manifest_checksum: str,
    provenance_source: BuilderProvenanceSource,
    actor_user_id: UUID,
    agent_run_id: UUID | None,
    agent_id: UUID | None,
    agent_version_id: UUID | None,
    agent_assignment_id: UUID | None,
    conn: BaseDBAsyncClient,
) -> AppliedBuilderRevision:
    structure_record = await repository.get_structure_revision(
        project_id=UUID(str(base_manifest.project_id)),
        revision_id=UUID(str(base_manifest.content_structure_revision_id)),
        conn=conn,
    )
    if structure_record is None or structure_record.structure_hash != base_manifest.content_structure_hash:
        _raise_conflict("CONTENT_STRUCTURE_REVISION_MISSING")
    now = datetime.now(UTC)
    manifest = build_next_site_revision_manifest(
        NextSiteRevisionManifestInput(
            base=base_manifest,
            content_structure_revision_id=UUID(str(base_manifest.content_structure_revision_id)),
            content_structure_hash=base_manifest.content_structure_hash,
            page_versions=base_manifest.page_versions,
            global_section_versions=base_manifest.global_section_versions,
            presentation_set_hash=base_manifest.presentation_set_hash,
            design_system_id=design_system_id,
            design_system_version_id=design_system_version_id,
            design_system_manifest_checksum=design_system_manifest_checksum,
            provenance_source=provenance_source,
            actor_user_id=actor_user_id,
            agent_run_id=agent_run_id,
            agent_id=agent_id,
            agent_version_id=agent_version_id,
            agent_assignment_id=agent_assignment_id,
            correlation_id=correlation_id.get(None),
            created_at=now,
        )
    )
    await _persist_site_revision(
        repository=repository,
        manifest=manifest,
        base_manifest=base_manifest,
        provenance_source=provenance_source,
        actor_user_id=actor_user_id,
        agent_run_id=agent_run_id,
        agent_id=agent_id,
        agent_version_id=agent_version_id,
        agent_assignment_id=agent_assignment_id,
        now=now,
        conn=conn,
    )
    await _supersede_base_and_create_draft_status(
        repository=repository,
        base_revision_id=UUID(str(base_manifest.id)),
        next_revision_id=UUID(str(manifest.id)),
        page_count=len(base_structure.pages),
        now=now,
        conn=conn,
    )
    return AppliedBuilderRevision(
        content_structure_revision=ContentStructureRevisionOut(
            id=structure_record.id,
            revision_number=structure_record.revision_number,
            parent_revision_id=structure_record.parent_revision_id,
            structure_hash=structure_record.structure_hash,
            snapshot=base_structure,
            created_at=structure_record.created_at,
        ),
        site_revision=manifest,
    )


async def _persist_site_revision(
    *,
    repository: SiteBuilderRepository,
    manifest: SiteRevisionManifestV1,
    base_manifest: SiteRevisionManifestV1,
    provenance_source: BuilderProvenanceSource,
    actor_user_id: UUID,
    agent_run_id: UUID | None,
    agent_id: UUID | None,
    agent_version_id: UUID | None,
    agent_assignment_id: UUID | None,
    now: datetime,
    conn: BaseDBAsyncClient,
) -> None:
    await repository.create_site_revision(
        values={
            "id": manifest.id,
            "created_at": now,
            "workspace_id": manifest.workspace_id,
            "project_id": manifest.project_id,
            "site_id": manifest.site_id,
            "environment_id": manifest.environment_id,
            "revision_number": manifest.revision_number,
            "base_revision_id": base_manifest.id,
            "manifest_version": manifest.manifest_version,
            "authoring_mode": manifest.project_authoring_mode,
            "content_structure_revision_id": manifest.content_structure_revision_id,
            "content_structure_hash": manifest.content_structure_hash,
            "design_system_id": manifest.design_system_id,
            "design_system_version_id": manifest.design_system_version_id,
            "design_system_manifest_checksum": manifest.design_system_manifest_checksum,
            "page_version_pins": [pin.model_dump(mode="json", by_alias=True) for pin in manifest.page_versions],
            "global_section_version_pins": [
                pin.model_dump(mode="json", by_alias=True) for pin in manifest.global_section_versions
            ],
            "presentation_set_hash": manifest.presentation_set_hash,
            "manifest_hash": manifest.manifest_hash,
            "manifest_snapshot": manifest.model_dump(mode="json", by_alias=True),
            "provenance_source": provenance_source,
            "actor_user_id": actor_user_id,
            "agent_run_id": agent_run_id,
            "agent_id": agent_id,
            "agent_version_id": agent_version_id,
            "agent_assignment_id": agent_assignment_id,
            "correlation_id": correlation_id.get(None),
        },
        conn=conn,
    )


async def _snapshot_current_structure(
    *,
    repository: SiteBuilderRepository,
    workspace_id: UUID,
    project_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    default_locale: str,
    fallback_locale: str,
    base_structure: ContentStructureSnapshotV1,
    planning_overrides: dict[UUID, BuilderPagePlanningV1],
    conn: BaseDBAsyncClient,
) -> ContentStructureSnapshotV1:
    routes, hierarchy, items = await repository.list_structure_records(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        conn=conn,
    )
    global_items = await repository.list_global_section_records(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        conn=conn,
    )
    return build_structure_snapshot(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        default_locale=default_locale,
        fallback_locale=fallback_locale,
        routes=routes,
        hierarchy=hierarchy,
        items=items,
        global_items=global_items,
        base_structure=base_structure,
        planning_overrides=planning_overrides,
    )


async def _supersede_base_and_create_draft_status(
    *,
    repository: SiteBuilderRepository,
    base_revision_id: UUID,
    next_revision_id: UUID,
    page_count: int,
    now: datetime,
    conn: BaseDBAsyncClient,
) -> None:
    base_status = await repository.get_status(
        site_revision_id=base_revision_id,
        conn=conn,
        for_update=True,
    )
    if base_status is None:
        _raise_conflict("SITE_REVISION_STATUS_MISSING")
    superseded_payload: JsonObject = {
        "siteRevisionId": str(base_revision_id),
        "status": SiteRevisionLifecycleStatus.SUPERSEDED.value,
        "statusRevision": int(base_status.status_revision) + 1,
        "readinessFindings": cast(list[JsonObject], base_status.readiness_findings),
        "validatorVersion": str(base_status.validator_version),
        "calculatedAt": now.isoformat(),
    }
    await repository.update_status(
        record=base_status,
        values={
            "status": SiteRevisionLifecycleStatus.SUPERSEDED,
            "status_revision": int(base_status.status_revision) + 1,
            "etag": canonical_hash(cast(JsonValue, superseded_payload)),
            "calculated_at": now,
        },
        conn=conn,
    )
    findings = _reconcile_empty_site_finding(
        findings=cast(list[JsonObject], base_status.readiness_findings),
        page_count=page_count,
    )
    draft_payload: JsonObject = {
        "siteRevisionId": str(next_revision_id),
        "status": SiteRevisionLifecycleStatus.DRAFT.value,
        "statusRevision": 1,
        "readinessFindings": findings,
        "validatorVersion": _BUILDER_VALIDATOR_VERSION,
        "calculatedAt": now.isoformat(),
    }
    await repository.create_status(
        values={
            "site_revision_id": next_revision_id,
            "status": SiteRevisionLifecycleStatus.DRAFT,
            "status_revision": 1,
            "readiness_findings": findings,
            "validator_version": _BUILDER_VALIDATOR_VERSION,
            "etag": canonical_hash(cast(JsonValue, draft_payload)),
            "calculated_at": now,
        },
        conn=conn,
    )


def _reconcile_empty_site_finding(*, findings: list[JsonObject], page_count: int) -> list[JsonObject]:
    current = [finding for finding in findings if finding.get("code") != "BUILDER_SITE_EMPTY"]
    if page_count == 0:
        current.insert(0, dict(_EMPTY_SITE_FINDING))
    return current


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = [
    "AppliedBuilderRevision",
    "create_design_system_refresh_revision",
    "create_next_builder_revision",
]
