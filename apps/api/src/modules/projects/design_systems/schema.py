from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.workspaces.design_systems.schema import (
    DesignSystemCursorPage,
    DesignSystemLifecycleStatus,
    DesignSystemManifestDiffOut,
    DesignSystemVersionSummaryOut,
)


class ProjectDesignSystemAssignmentOut(BaseSchema):
    project_id: PublicUUID
    design_system_id: PublicUUID
    version_id: PublicUUID
    manifest_checksum: str
    validation_finding_hash: str
    metadata_revision: int = Field(ge=1)
    owner_kind: str
    assigned_at: datetime


class ProjectDesignSystemAssignmentSetRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    design_system_id: PublicUUID
    version_id: PublicUUID
    expected_manifest_checksum: str = Field(min_length=71, max_length=71)
    validation_finding_hash: str = Field(min_length=71, max_length=71)
    expected_revision: int = Field(ge=0)


class ProjectDesignSystemAssignmentResultOut(BaseSchema):
    previous: ProjectDesignSystemAssignmentOut | None
    current: ProjectDesignSystemAssignmentOut
    active_release_changed: bool = False
    site_revision_changed: bool = False


class ProjectDesignSystemForkRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    source_design_system_id: PublicUUID
    source_version_id: PublicUUID
    expected_source_checksum: str = Field(min_length=71, max_length=71)
    validation_finding_hash: str = Field(min_length=71, max_length=71)
    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1000)


class ProjectDesignSystemForkOut(BaseSchema):
    project_id: PublicUUID
    design_system_id: PublicUUID
    version_id: PublicUUID
    manifest_checksum: str
    validation_finding_hash: str
    source_design_system_id: PublicUUID
    source_version_id: PublicUUID
    source_manifest_checksum: str


class ProjectDesignSystemComparisonRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    from_version_id: PublicUUID
    to_version_id: PublicUUID


class ProjectDesignSystemComparisonOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    from_version: DesignSystemVersionSummaryOut
    to_version: DesignSystemVersionSummaryOut
    comparison_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    diff: DesignSystemManifestDiffOut


DesignSystemImpactSeverity = Literal["warning", "blocker"]
DesignSystemImpactReasonCode = Literal[
    "DESIGN_SYSTEM_TOKEN_CHANGE_REACHES_COMPONENT_RECIPE",
    "DESIGN_SYSTEM_COMPONENT_RECIPE_CHANGED",
    "DESIGN_SYSTEM_COMPONENT_RECIPE_ADDED",
    "DESIGN_SYSTEM_COMPONENT_RECIPE_REMOVED",
]


class ProjectDesignSystemImpactCoverageOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    assignment: Literal["evaluated"] = "evaluated"
    site_revisions: Literal["evaluated"] = "evaluated"
    wireframes: Literal["evaluated"] = "evaluated"
    asset_authorization: Literal["manifest_only"] = "manifest_only"
    active_release: Literal["not_evaluated"] = "not_evaluated"
    renderer: Literal["not_evaluated"] = "not_evaluated"
    compiler_artifacts: Literal["not_evaluated"] = "not_evaluated"


class ProjectDesignSystemImpactSummaryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    has_impact: bool
    assignment_uses_from_version: bool
    referenced_site_revision_count: int = Field(ge=0)
    historical_site_revision_count: int = Field(ge=0)
    current_site_revision_count: int = Field(ge=0)
    affected_page_count: int = Field(ge=0)
    affected_section_count: int = Field(ge=0)
    blocker_count: int = Field(ge=0)
    warning_count: int = Field(ge=0)
    mapped_diff_count: int = Field(ge=0)
    unmapped_diff_count: int = Field(ge=0)


class ProjectDesignSystemImpactEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    severity: DesignSystemImpactSeverity
    reason_code: DesignSystemImpactReasonCode
    site_revision_id: PublicUUID
    revision_number: int = Field(ge=1)
    page_item_id: PublicUUID
    section_id: str = Field(min_length=1, max_length=128)
    component_key: str = Field(min_length=1, max_length=128)
    variant_key: str = Field(min_length=1, max_length=128)
    recipe_key: str = Field(min_length=1, max_length=128)
    diff_paths: tuple[str, ...] = Field(min_length=1)


class ProjectDesignSystemImpactAnalysisOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    impact_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    diff: DesignSystemManifestDiffOut
    coverage: ProjectDesignSystemImpactCoverageOut
    summary: ProjectDesignSystemImpactSummaryOut
    impacts: tuple[ProjectDesignSystemImpactEntryOut, ...]


class ProjectDesignSystemImpactPreviewRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    from_version_id: PublicUUID
    to_version_id: PublicUUID


class ProjectDesignSystemImpactPreviewOut(ProjectDesignSystemImpactAnalysisOut):
    from_version: DesignSystemVersionSummaryOut
    to_version: DesignSystemVersionSummaryOut


class ProjectDesignSystemVersionPageOut(DesignSystemCursorPage[DesignSystemVersionSummaryOut]):
    system_metadata_revision: int = Field(ge=1)


class ProjectDesignSystemSupersessionRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    replacement_version_id: PublicUUID
    expected_replacement_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    expected_target_status: DesignSystemLifecycleStatus
    expected_target_status_revision: int = Field(ge=1)
    expected_system_revision: int = Field(ge=1)


class ProjectDesignSystemSupersessionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    target_version: DesignSystemVersionSummaryOut
    replacement_version: DesignSystemVersionSummaryOut
    previous_latest_valid_version_id: PublicUUID | None
    current_latest_valid_version_id: PublicUUID | None
    system_metadata_revision: int = Field(ge=1)
    assignment_changed: Literal[False] = False
    site_revision_changed: Literal[False] = False
    active_release_changed: Literal[False] = False
