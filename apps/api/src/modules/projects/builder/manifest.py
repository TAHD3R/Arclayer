from __future__ import annotations

from datetime import datetime
from typing import NoReturn, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from src.common.types.json_types import JsonValue
from src.common.utils.ids import uuid7
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.builder._enums import BuilderProvenanceSource
from src.models.builder.site_revision import SiteRevisionManifestRecord
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionVersionPinV1,
    BuilderPageVersionPinV1,
    SiteRevisionManifestV1,
)
from src.modules.projects.builder.snapshot import canonical_hash


class RootSiteRevisionManifestInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    project_id: UUID
    site_id: UUID
    environment_id: UUID
    content_structure_revision_id: UUID
    content_structure_hash: str
    page_versions: tuple[BuilderPageVersionPinV1, ...]
    presentation_set_hash: str
    design_system_id: UUID
    design_system_version_id: UUID
    design_system_manifest_checksum: str
    provenance_source: BuilderProvenanceSource
    actor_user_id: UUID | None
    agent_run_id: UUID | None
    agent_id: UUID | None = None
    agent_version_id: UUID | None = None
    agent_assignment_id: UUID | None = None
    correlation_id: str | None
    created_at: datetime
    global_section_versions: tuple[BuilderGlobalSectionVersionPinV1, ...] = ()


class NextSiteRevisionManifestInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    base: SiteRevisionManifestV1
    content_structure_revision_id: UUID
    content_structure_hash: str
    page_versions: tuple[BuilderPageVersionPinV1, ...]
    presentation_set_hash: str
    design_system_id: UUID
    design_system_version_id: UUID
    design_system_manifest_checksum: str
    provenance_source: BuilderProvenanceSource
    actor_user_id: UUID | None
    agent_run_id: UUID | None
    agent_id: UUID | None = None
    agent_version_id: UUID | None = None
    agent_assignment_id: UUID | None = None
    correlation_id: str | None
    created_at: datetime
    global_section_versions: tuple[BuilderGlobalSectionVersionPinV1, ...] = ()


def build_root_site_revision_manifest(inputs: RootSiteRevisionManifestInput) -> SiteRevisionManifestV1:
    manifest = SiteRevisionManifestV1(
        id=uuid7(),
        workspace_id=inputs.workspace_id,
        project_id=inputs.project_id,
        site_id=inputs.site_id,
        environment_id=inputs.environment_id,
        revision_number=1,
        project_authoring_mode="builder_managed",
        content_structure_revision_id=inputs.content_structure_revision_id,
        content_structure_hash=inputs.content_structure_hash,
        page_versions=inputs.page_versions,
        global_section_versions=inputs.global_section_versions,
        presentation_set_hash=inputs.presentation_set_hash,
        design_system_id=inputs.design_system_id,
        design_system_version_id=inputs.design_system_version_id,
        design_system_manifest_checksum=inputs.design_system_manifest_checksum,
        provenance_source=inputs.provenance_source,
        actor_user_id=inputs.actor_user_id,
        agent_run_id=inputs.agent_run_id,
        agent_id=inputs.agent_id,
        agent_version_id=inputs.agent_version_id,
        agent_assignment_id=inputs.agent_assignment_id,
        correlation_id=inputs.correlation_id,
        created_at=inputs.created_at,
        manifest_hash=f"sha256:{'0' * 64}",
    )
    hash_input = manifest.model_dump(mode="json", by_alias=True, exclude={"manifest_hash"})
    return manifest.model_copy(update={"manifest_hash": canonical_hash(cast(JsonValue, hash_input))})


def build_next_site_revision_manifest(inputs: NextSiteRevisionManifestInput) -> SiteRevisionManifestV1:
    base = inputs.base
    manifest = SiteRevisionManifestV1(
        id=uuid7(),
        workspace_id=base.workspace_id,
        project_id=base.project_id,
        site_id=base.site_id,
        environment_id=base.environment_id,
        revision_number=base.revision_number + 1,
        base_revision_id=base.id,
        project_authoring_mode=base.project_authoring_mode,
        content_structure_revision_id=inputs.content_structure_revision_id,
        content_structure_hash=inputs.content_structure_hash,
        page_versions=inputs.page_versions,
        global_section_versions=inputs.global_section_versions,
        presentation_set_hash=inputs.presentation_set_hash,
        design_system_id=inputs.design_system_id,
        design_system_version_id=inputs.design_system_version_id,
        design_system_manifest_checksum=inputs.design_system_manifest_checksum,
        planning_documents=base.planning_documents,
        asset_inputs=base.asset_inputs,
        provenance_source=inputs.provenance_source,
        actor_user_id=inputs.actor_user_id,
        agent_run_id=inputs.agent_run_id,
        agent_id=inputs.agent_id,
        agent_version_id=inputs.agent_version_id,
        agent_assignment_id=inputs.agent_assignment_id,
        correlation_id=inputs.correlation_id,
        created_at=inputs.created_at,
        manifest_hash=f"sha256:{'0' * 64}",
    )
    hash_input = manifest.model_dump(mode="json", by_alias=True, exclude={"manifest_hash"})
    return manifest.model_copy(update={"manifest_hash": canonical_hash(cast(JsonValue, hash_input))})


def parse_site_revision_manifest(record: SiteRevisionManifestRecord) -> SiteRevisionManifestV1:
    try:
        manifest = SiteRevisionManifestV1.model_validate(record.manifest_snapshot)
    except ValidationError:
        _raise_conflict("SITE_REVISION_MANIFEST_INVALID")
    expected = canonical_hash(
        cast(JsonValue, manifest.model_dump(mode="json", by_alias=True, exclude={"manifest_hash"}))
    )
    if expected != manifest.manifest_hash or record.manifest_hash != manifest.manifest_hash:
        _raise_conflict("SITE_REVISION_MANIFEST_INVALID")
    return manifest


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))
