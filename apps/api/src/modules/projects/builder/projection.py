from __future__ import annotations

from typing import NoReturn, cast
from uuid import UUID

from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonValue
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.models.builder.content_structure import ContentStructureRevisionRecord
from src.models.builder.site_revision import SiteRevisionStatusRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.models.projects.project import ProjectRecord
from src.modules.projects.builder.global_section_graph import analyze_global_section_dependencies
from src.modules.projects.builder.manifest import parse_site_revision_manifest
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.revision_presentations import (
    presentation_pins_match_manifest,
    project_visual_blueprints_by_version,
    project_wireframes_by_version,
)
from src.modules.projects.builder.schema import (
    BuilderRevisionGlobalSectionOut,
    BuilderRevisionOut,
    BuilderRevisionPageOut,
    BuilderSectionIntentV1,
    BuilderWireframeTraceabilityOut,
    ContentStructureRevisionOut,
    ContentStructureSnapshotV1,
    ProjectAuthoringAuthorityOut,
    ProjectBuilderProjectionOut,
    SiteRevisionManifestV1,
    SiteRevisionStatusOut,
)
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.projects.content.items.domain_helpers import read_summary_field, read_title_field
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository


async def get_project_builder_projection(
    *,
    repository: SiteBuilderRepository,
    design_system_repository: ProjectDesignSystemsRepository,
    workspace_id: UUID,
    project_id: UUID,
    runtime_id: UUID | None,
) -> ProjectBuilderProjectionOut:
    project = await repository.get_project(project_id=project_id, workspace_id=workspace_id)
    if project is None:
        _raise_not_found("PROJECT_NOT_FOUND")
    authority = project_authoring_authority(project)
    site = await repository.get_site(project_id=project_id, runtime_id=runtime_id) if runtime_id is not None else None
    environment = await repository.get_default_preview_environment(project_id=project_id)
    current = (
        await repository.get_latest_site_revision(
            project_id=project_id,
            site_id=site.id,
            environment_id=environment.id,
        )
        if site is not None and environment is not None
        else None
    )
    current_status = await _require_status(repository=repository, site_revision_id=current.id) if current else None
    blockers = await _projection_blockers(
        design_system_repository=design_system_repository,
        project=project,
        runtime_id=runtime_id,
        site_exists=site is not None,
        environment_exists=environment is not None,
        current_exists=current is not None,
    )
    return ProjectBuilderProjectionOut(
        project_id=project_id,
        workspace_id=workspace_id,
        authoring_authority=authority,
        primary_site_id=site.id if site is not None else None,
        default_preview_environment_id=environment.id if environment is not None else None,
        current_site_revision=parse_site_revision_manifest(current) if current is not None else None,
        current_status=site_revision_status_out(current_status) if current_status is not None else None,
        initialization_required=(
            ProjectAuthoringState(project.authoring_state) is ProjectAuthoringState.READY
            and project.authoring_mode is not None
            and ProjectAuthoringMode(project.authoring_mode) is ProjectAuthoringMode.BUILDER_MANAGED
            and current is None
        ),
        blockers=tuple(blockers),
    )


async def get_project_builder_revision(
    *,
    repository: SiteBuilderRepository,
    workspace_id: UUID,
    project_id: UUID,
    revision_id: UUID,
    conn: BaseDBAsyncClient,
) -> BuilderRevisionOut:
    record = await repository.get_site_revision(project_id=project_id, revision_id=revision_id, conn=conn)
    if record is None or record.workspace_id != workspace_id:
        _raise_not_found("SITE_REVISION_NOT_FOUND")
    manifest = parse_site_revision_manifest(record)
    structure_record = await repository.get_structure_revision(
        project_id=project_id,
        revision_id=UUID(str(manifest.content_structure_revision_id)),
        conn=conn,
    )
    structure = _content_structure_projection(
        record=structure_record,
        workspace_id=workspace_id,
        manifest=manifest,
    )
    status = await repository.get_status(site_revision_id=revision_id, conn=conn)
    if status is None:
        _raise_conflict("SITE_REVISION_STATUS_MISSING")
    structure_item_ids = [
        UUID(str(node.item_id)) for node in (*structure.snapshot.pages, *structure.snapshot.global_references)
    ]
    versions = await repository.list_content_versions(
        item_ids=structure_item_ids,
        conn=conn,
    )
    version_by_item = _validated_content_versions(
        manifest=manifest,
        structure=structure.snapshot,
        versions=versions,
    )
    presentations, bindings = await repository.list_presentations_and_bindings(
        version_ids=[record.id for record in version_by_item.values()],
        conn=conn,
    )
    if not presentation_pins_match_manifest(
        manifest=manifest,
        version_by_item=version_by_item,
        presentations=presentations,
        bindings=bindings,
    ):
        _raise_conflict("BUILDER_PRESENTATION_SET_INVALID")
    wireframes = project_wireframes_by_version(manifest=manifest, presentations=presentations)
    if wireframes is None:
        _raise_conflict("BUILDER_WIREFRAME_INVALID")
    visual_blueprints = project_visual_blueprints_by_version(
        manifest=manifest,
        presentations=presentations,
    )
    if visual_blueprints is None:
        _raise_conflict("BUILDER_VISUAL_BLUEPRINT_INVALID")
    pages = _revision_pages(
        manifest=manifest,
        structure=structure.snapshot,
        version_by_item=version_by_item,
        wireframes=wireframes,
        visual_blueprints=visual_blueprints,
    )
    global_sections = _revision_global_sections(
        manifest=manifest,
        structure=structure.snapshot,
        version_by_item=version_by_item,
        wireframes=wireframes,
        visual_blueprints=visual_blueprints,
    )
    wireframes_by_item = {
        item_id: wireframes.get(UUID(str(version.id))) for item_id, version in version_by_item.items()
    }
    return BuilderRevisionOut(
        site_revision=manifest,
        status=site_revision_status_out(status),
        content_structure_revision=structure,
        pages=pages,
        global_sections=global_sections,
        global_section_graph=analyze_global_section_dependencies(
            structure=structure.snapshot,
            wireframes_by_item=wireframes_by_item,
        ),
    )


def _content_structure_projection(
    *,
    record: ContentStructureRevisionRecord | None,
    workspace_id: UUID,
    manifest: SiteRevisionManifestV1,
) -> ContentStructureRevisionOut:
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
    return ContentStructureRevisionOut(
        id=record.id,
        revision_number=record.revision_number,
        parent_revision_id=record.parent_revision_id,
        structure_hash=record.structure_hash,
        snapshot=snapshot,
        created_at=record.created_at,
    )


def _validated_content_versions(
    *,
    manifest: SiteRevisionManifestV1,
    structure: ContentStructureSnapshotV1,
    versions: list[ContentVersionRecord],
) -> dict[UUID, ContentVersionRecord]:
    pin_by_item = {UUID(str(pin.item_id)): pin for pin in (*manifest.page_versions, *manifest.global_section_versions)}
    version_by_id = {UUID(str(version.id)): version for version in versions}
    structure_item_ids = {UUID(str(node.item_id)) for node in (*structure.pages, *structure.global_references)}
    if set(pin_by_item) != structure_item_ids:
        _raise_conflict("BUILDER_CONTENT_VERSION_REQUIRED")
    result: dict[UUID, ContentVersionRecord] = {}
    for item_id, pin in pin_by_item.items():
        pin = pin_by_item[item_id]
        version = version_by_id.get(UUID(str(pin.content_version_id)))
        title = read_title_field(version.fields_snapshot if version is not None else None)
        if (
            version is None
            or UUID(str(version.item_id)) != item_id
            or int(version.version) != pin.version_number
            or title is None
        ):
            _raise_conflict("BUILDER_CONTENT_VERSION_REQUIRED")
        result[item_id] = version
    return result


def _revision_global_sections(
    *,
    manifest: SiteRevisionManifestV1,
    structure: ContentStructureSnapshotV1,
    version_by_item: dict[UUID, ContentVersionRecord],
    wireframes: dict[UUID, WireframeDocumentV1],
    visual_blueprints: dict[UUID, VisualBlueprintDocumentV1],
) -> tuple[BuilderRevisionGlobalSectionOut, ...]:
    pins = {UUID(str(pin.item_id)): pin for pin in manifest.global_section_versions}
    sections: list[BuilderRevisionGlobalSectionOut] = []
    for node in structure.global_references:
        item_id = UUID(str(node.item_id))
        pin = pins[item_id]
        version = version_by_item[item_id]
        title = read_title_field(version.fields_snapshot)
        if title is None:
            _raise_conflict("BUILDER_CONTENT_VERSION_REQUIRED")
        wireframe = wireframes.get(UUID(str(version.id)))
        wireframe_checksum = (
            canonical_hash(cast(JsonValue, wireframe.model_dump(mode="json", by_alias=True)))
            if wireframe is not None
            else None
        )
        sections.append(
            BuilderRevisionGlobalSectionOut(
                item_id=item_id,
                content_version_id=pin.content_version_id,
                version_number=pin.version_number,
                title=title,
                summary=read_summary_field(version.fields_snapshot),
                locale=node.locale,
                slug=node.slug,
                purpose=node.purpose,
                section_intents=node.section_intents,
                wireframe_traceability=_wireframe_traceability(
                    section_intents=node.section_intents,
                    wireframe=wireframe,
                ),
                wireframe_checksum=wireframe_checksum,
                wireframe=wireframe,
                visual_blueprint=visual_blueprints.get(UUID(str(version.id))),
            )
        )
    return tuple(sections)


def _revision_pages(
    *,
    manifest: SiteRevisionManifestV1,
    structure: ContentStructureSnapshotV1,
    version_by_item: dict[UUID, ContentVersionRecord],
    wireframes: dict[UUID, WireframeDocumentV1],
    visual_blueprints: dict[UUID, VisualBlueprintDocumentV1],
) -> tuple[BuilderRevisionPageOut, ...]:
    pages: list[BuilderRevisionPageOut] = []
    for page in structure.pages:
        item_id = UUID(str(page.item_id))
        pin = next(pin for pin in manifest.page_versions if UUID(str(pin.item_id)) == item_id)
        version = version_by_item[item_id]
        title = read_title_field(version.fields_snapshot)
        if title is None:
            _raise_conflict("BUILDER_CONTENT_VERSION_REQUIRED")
        wireframe = wireframes.get(UUID(str(version.id)))
        wireframe_checksum = (
            canonical_hash(cast(JsonValue, wireframe.model_dump(mode="json", by_alias=True)))
            if wireframe is not None
            else None
        )
        pages.append(
            BuilderRevisionPageOut(
                item_id=item_id,
                content_version_id=pin.content_version_id,
                version_number=pin.version_number,
                title=title,
                summary=read_summary_field(version.fields_snapshot),
                parent_item_id=page.parent_item_id,
                sort_order=page.sort_order,
                routes=page.routes,
                purpose=page.purpose,
                section_intents=page.section_intents,
                wireframe_traceability=_wireframe_traceability(
                    section_intents=page.section_intents,
                    wireframe=wireframe,
                ),
                wireframe_checksum=wireframe_checksum,
                wireframe=wireframe,
                visual_blueprint=visual_blueprints.get(UUID(str(version.id))),
            )
        )
    return tuple(pages)


def _wireframe_traceability(
    *,
    section_intents: tuple[BuilderSectionIntentV1, ...],
    wireframe: WireframeDocumentV1 | None,
) -> BuilderWireframeTraceabilityOut:
    canonical_intent_ids = tuple(intent.id for intent in section_intents)
    if wireframe is None:
        return BuilderWireframeTraceabilityOut(
            status="not_started" if canonical_intent_ids else "unplanned",
            missing_intent_ids=canonical_intent_ids,
        )

    canonical_intent_id_set = set(canonical_intent_ids)
    mapped_intent_ids = {section.intent_id for section in wireframe.sections}
    missing_intent_ids = tuple(intent_id for intent_id in canonical_intent_ids if intent_id not in mapped_intent_ids)
    orphaned_section_ids = tuple(
        section.id for section in wireframe.sections if section.intent_id not in canonical_intent_id_set
    )
    if orphaned_section_ids:
        status = "orphaned"
    elif missing_intent_ids:
        status = "partial"
    else:
        status = "aligned" if canonical_intent_ids else "unplanned"
    return BuilderWireframeTraceabilityOut(
        status=status,
        missing_intent_ids=missing_intent_ids,
        orphaned_section_ids=orphaned_section_ids,
    )


def project_authoring_authority(project: ProjectRecord) -> ProjectAuthoringAuthorityOut:
    return ProjectAuthoringAuthorityOut(
        mode=(ProjectAuthoringMode(project.authoring_mode) if project.authoring_mode is not None else None),
        state=ProjectAuthoringState(project.authoring_state),
        revision=int(project.authoring_revision),
    )


def site_revision_status_out(record: SiteRevisionStatusRecord) -> SiteRevisionStatusOut:
    return SiteRevisionStatusOut(
        site_revision_id=record.site_revision_id,
        status=record.status,
        status_revision=record.status_revision,
        readiness_findings=tuple(record.readiness_findings or ()),
        validator_version=record.validator_version,
        etag=record.etag,
        calculated_at=record.calculated_at,
    )


async def _require_status(
    *,
    repository: SiteBuilderRepository,
    site_revision_id: UUID,
) -> SiteRevisionStatusRecord:
    record = await repository.get_status(site_revision_id=site_revision_id)
    if record is None:
        _raise_conflict("SITE_REVISION_STATUS_MISSING")
    return record


async def _projection_blockers(
    *,
    design_system_repository: ProjectDesignSystemsRepository,
    project: ProjectRecord,
    runtime_id: UUID | None,
    site_exists: bool,
    environment_exists: bool,
    current_exists: bool,
) -> list[str]:
    blockers: list[str] = []
    state = ProjectAuthoringState(project.authoring_state)
    mode = ProjectAuthoringMode(project.authoring_mode) if project.authoring_mode is not None else None
    if state is ProjectAuthoringState.MIGRATION_REQUIRED or mode is None:
        blockers.append("PROJECT_AUTHORING_MODE_REQUIRED")
    elif mode is ProjectAuthoringMode.SOURCE_MANAGED:
        blockers.append("PROJECT_AUTHORING_MODE_MISMATCH")
    if runtime_id is None:
        blockers.append("PROJECT_RUNTIME_IDENTITY_REQUIRED")
    elif not site_exists:
        blockers.append("BUILDER_SITE_NOT_FOUND")
    if not environment_exists:
        blockers.append("BUILDER_ENVIRONMENT_NOT_FOUND")
    if state is ProjectAuthoringState.READY and mode is ProjectAuthoringMode.BUILDER_MANAGED:
        if await design_system_repository.get_assignment(project_id=project.id) is None:
            blockers.append("PROJECT_DESIGN_SYSTEM_ASSIGNMENT_REQUIRED")
        if not current_exists:
            blockers.append("BUILDER_INITIALIZATION_REQUIRED")
    return blockers


def _raise_not_found(code: str) -> NoReturn:
    raise NotFound(error=code, message=t("errors", code))


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))
