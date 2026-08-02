from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonValue
from src.common.types.public_uuid import PublicUUID
from src.modules.projects.builder.render_document_schema import BuilderPageRenderDocumentOut
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestInputV1, DesignSystemManifestV1
from src.modules.workspaces.design_systems.validator import DesignSystemValidationFinding


class DesignSystemCursorPage[T](BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    items: tuple[T, ...] = Field(default_factory=tuple)
    next_cursor: PublicUUID | None = None


type DesignSystemManifestDiffKind = Literal[
    "asset_reference",
    "breakpoint",
    "component_catalog",
    "component_recipe",
    "component_token",
    "extension",
    "metadata",
    "motion_role",
    "primitive_token",
    "semantic_token",
    "theme",
    "typography_role",
]
type DesignSystemManifestDiffOperation = Literal["added", "changed", "removed"]
type DesignSystemLifecycleStatus = Literal[
    "candidate",
    "validating",
    "valid",
    "published",
    "invalid",
    "superseded",
    "archived",
]


class DesignSystemManifestDiffEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: DesignSystemManifestDiffKind
    operation: DesignSystemManifestDiffOperation
    path: str = Field(min_length=1, max_length=512)
    before: JsonValue = None
    after: JsonValue = None


class DesignSystemManifestDiffOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    has_changes: bool
    added_count: int = Field(ge=0)
    changed_count: int = Field(ge=0)
    removed_count: int = Field(ge=0)
    entries: tuple[DesignSystemManifestDiffEntryOut, ...] = Field(default_factory=tuple)


class WorkspaceDesignSystemsCapabilitiesOut(BaseSchema):
    workspace_foundation: Literal[True] = True
    immutable_versions: Literal[True] = True
    foundation_validation: Literal[True] = True
    exact_default_assignment: Literal[True] = True
    project_assignment: Literal[True] = True
    project_fork: Literal[True] = True
    project_version_authoring: Literal[True] = True
    project_version_history: Literal[True] = True
    project_version_comparison: Literal[True] = True
    project_version_impact_preview: Literal[True] = True
    project_version_supersession: Literal[True] = True
    agent_run_context: Literal[True] = True
    builder_context: Literal[True] = True
    component_catalog_validation: Literal[True] = True
    renderer_preview: Literal[True] = True
    compilation: Literal[False] = False
    publication: Literal[False] = False
    import_available: Literal[False] = False
    derivation_available: Literal[False] = False


class DesignSystemCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1000)


class DesignSystemVersionCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    manifest: DesignSystemManifestInputV1
    parent_version_id: PublicUUID | None = None
    expected_parent_checksum: str | None = Field(default=None, pattern=r"^sha256:[0-9a-f]{64}$")
    source: Literal["manual"] = "manual"


class DesignSystemValidationCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    profile: Literal["foundation"] = "foundation"
    validator_version: Literal[2] = 2


class WorkspaceDesignSystemRepresentativePreviewRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    project_id: PublicUUID
    site_revision_id: PublicUUID
    page_item_id: PublicUUID
    locale: str = Field(min_length=1, max_length=16)
    theme_key: str | None = Field(default=None, min_length=1, max_length=64)


class WorkspaceDesignSystemRepresentativePreviewOut(BaseSchema):
    design_system_id: PublicUUID
    version_id: PublicUUID
    manifest_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    project_id: PublicUUID
    site_revision_id: PublicUUID
    page_item_id: PublicUUID
    locale: str = Field(min_length=1, max_length=16)
    theme_key: str = Field(min_length=1, max_length=64)
    document: BuilderPageRenderDocumentOut


class WorkspaceDesignSystemDefaultSetRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    design_system_id: PublicUUID
    version_id: PublicUUID
    expected_manifest_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    expected_revision: int = Field(ge=0)


class DesignSystemSummaryOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    owner_kind: Literal["workspace", "project"]
    owning_project_id: PublicUUID | None
    name: str
    description: str | None
    status: Literal["active", "archived"]
    is_default: bool
    default_version_id: PublicUUID | None
    latest_valid_version_id: PublicUUID | None
    metadata_revision: int = Field(ge=1)
    version_count: int = Field(ge=0)
    created_by_user_id: PublicUUID | None
    updated_by_user_id: PublicUUID | None
    created_at: datetime
    updated_at: datetime


class DesignSystemDetailOut(DesignSystemSummaryOut):
    latest_version: DesignSystemVersionSummaryOut | None = None


class DesignSystemVersionSummaryOut(BaseSchema):
    id: PublicUUID
    design_system_id: PublicUUID
    workspace_id: PublicUUID
    version_number: int = Field(ge=1)
    manifest_checksum: str
    token_index_hash: str
    component_catalog_version: str | None
    parent_version_id: PublicUUID | None
    source: str
    validation_status: str | None
    validation_finding_hash: str | None
    lifecycle_status: DesignSystemLifecycleStatus
    status_revision: int = Field(ge=1)
    superseded_by_version_id: PublicUUID | None
    status_changed_at: datetime
    status_changed_by_user_id: PublicUUID | None
    publish_ready: Literal[False] = False
    created_by_user_id: PublicUUID | None
    created_at: datetime


class DesignSystemVersionDetailOut(DesignSystemVersionSummaryOut):
    manifest: DesignSystemManifestV1
    provenance: dict[str, object]


class DesignSystemValidationResultOut(BaseSchema):
    id: PublicUUID
    design_system_version_id: PublicUUID
    workspace_id: PublicUUID
    profile: Literal["foundation"]
    validator_version: int = Field(ge=1)
    status: Literal["valid", "invalid"]
    findings: tuple[DesignSystemValidationFinding, ...]
    finding_hash: str
    token_index_hash: str
    publish_ready: Literal[False]
    compatibility: dict[str, str]
    actor_user_id: PublicUUID | None
    created_at: datetime


class WorkspaceDesignSystemDefaultOut(BaseSchema):
    workspace_id: PublicUUID
    design_system_id: PublicUUID
    version_id: PublicUUID
    manifest_checksum: str
    validation_finding_hash: str
    metadata_revision: int = Field(ge=1)
    assigned_by_user_id: PublicUUID | None
    updated_at: datetime
