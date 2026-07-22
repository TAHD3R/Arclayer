from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue
from src.common.types.public_uuid import PublicUUID
from src.models.builder._enums import BuilderProvenanceSource, SiteRevisionLifecycleStatus
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.modules.projects.builder.global_section_schema import BuilderGlobalSectionDependencyGraphOut
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.workspaces.design_systems.manifest import TokenValueType

Checksum = str


class BuilderRouteSnapshotV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    locale: str = Field(min_length=1, max_length=16)
    path: str = Field(min_length=1, max_length=512)
    is_active: bool
    route_contract: JsonObject | None = None


class BuilderSectionIntentV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=128)
    goal: str = Field(min_length=1, max_length=1000)
    generation_guidance: str | None = Field(
        default=None,
        max_length=2000,
        exclude_if=lambda value: value is None,
    )

    @field_validator("id", "label", "goal", "generation_guidance", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class BuilderPagePlanningV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    purpose: str | None = Field(
        default=None,
        min_length=1,
        max_length=1000,
        exclude_if=lambda value: value is None,
    )
    section_intents: tuple[BuilderSectionIntentV1, ...] = Field(
        default=(),
        max_length=100,
        exclude_if=lambda value: not value,
    )

    @field_validator("purpose", mode="before")
    @classmethod
    def normalize_purpose(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_unique_intent_ids(self) -> BuilderPagePlanningV1:
        intent_ids = [intent.id for intent in self.section_intents]
        if len(intent_ids) != len(set(intent_ids)):
            raise ValueError("section intent ids must be unique within a page")
        return self


class BuilderPageNodeSnapshotV1(BuilderPagePlanningV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    item_id: PublicUUID
    parent_item_id: PublicUUID | None = None
    sort_order: int
    routes: tuple[BuilderRouteSnapshotV1, ...] = ()


class BuilderGlobalSectionNodeSnapshotV1(BuilderPagePlanningV1):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    item_id: PublicUUID
    locale: str = Field(min_length=1, max_length=16)
    slug: str = Field(min_length=1, max_length=256)


class ContentStructureSnapshotV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1] = 1
    workspace_id: PublicUUID
    project_id: PublicUUID
    site_id: PublicUUID
    environment_id: PublicUUID
    locales: tuple[str, ...]
    pages: tuple[BuilderPageNodeSnapshotV1, ...]
    navigation_relationships: tuple[JsonObject, ...] = ()
    global_references: tuple[BuilderGlobalSectionNodeSnapshotV1, ...] = ()


class BuilderPageVersionPinV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    item_id: PublicUUID
    content_version_id: PublicUUID
    version_number: int = Field(ge=1)
    presentation_set_hash: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    component_binding_set_hash: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class BuilderGlobalSectionVersionPinV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    item_id: PublicUUID
    content_version_id: PublicUUID
    version_number: int = Field(ge=1)
    presentation_set_hash: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    component_binding_set_hash: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class SiteRevisionManifestV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    manifest_version: Literal[1] = 1
    id: PublicUUID
    workspace_id: PublicUUID
    project_id: PublicUUID
    site_id: PublicUUID
    environment_id: PublicUUID
    revision_number: int = Field(ge=1)
    base_revision_id: PublicUUID | None = None
    project_authoring_mode: Literal["builder_managed"]
    content_structure_revision_id: PublicUUID
    content_structure_hash: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    page_versions: tuple[BuilderPageVersionPinV1, ...]
    global_section_versions: tuple[BuilderGlobalSectionVersionPinV1, ...] = Field(
        default=(),
        exclude_if=lambda value: not value,
    )
    presentation_set_hash: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    design_system_id: PublicUUID
    design_system_version_id: PublicUUID
    design_system_manifest_checksum: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    planning_documents: tuple[JsonObject, ...] = ()
    asset_inputs: tuple[JsonObject, ...] = ()
    provenance_source: BuilderProvenanceSource
    actor_user_id: PublicUUID | None = None
    agent_run_id: PublicUUID | None = None
    agent_id: PublicUUID | None = Field(default=None, exclude_if=lambda value: value is None)
    agent_version_id: PublicUUID | None = Field(default=None, exclude_if=lambda value: value is None)
    agent_assignment_id: PublicUUID | None = Field(default=None, exclude_if=lambda value: value is None)
    correlation_id: str | None = Field(default=None, max_length=128)
    created_at: datetime
    manifest_hash: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class SiteRevisionFindingV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    category: Literal["content", "binding", "design", "accessibility", "domain", "build"]
    severity: Literal["info", "warning", "blocker"]
    code: str = Field(min_length=1, max_length=96)
    message_key: str = Field(min_length=1, max_length=128)
    meta: JsonObject = Field(default_factory=dict)


class SiteRevisionStatusOut(BaseSchema):
    site_revision_id: PublicUUID
    status: SiteRevisionLifecycleStatus
    status_revision: int = Field(ge=1)
    readiness_findings: tuple[SiteRevisionFindingV1, ...]
    validator_version: str
    etag: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    calculated_at: datetime


class ContentStructureRevisionOut(BaseSchema):
    id: PublicUUID
    revision_number: int = Field(ge=1)
    parent_revision_id: PublicUUID | None = None
    structure_hash: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    snapshot: ContentStructureSnapshotV1
    created_at: datetime


class BuilderWireframeTraceabilityOut(BaseSchema):
    status: Literal["unplanned", "not_started", "partial", "aligned", "orphaned"]
    missing_intent_ids: tuple[str, ...] = ()
    orphaned_section_ids: tuple[str, ...] = ()


class BuilderRevisionPageOut(BaseSchema):
    item_id: PublicUUID
    content_version_id: PublicUUID
    version_number: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=256)
    summary: str | None = None
    parent_item_id: PublicUUID | None = None
    sort_order: int
    routes: tuple[BuilderRouteSnapshotV1, ...] = ()
    purpose: str | None = None
    section_intents: tuple[BuilderSectionIntentV1, ...] = ()
    wireframe_traceability: BuilderWireframeTraceabilityOut
    wireframe_checksum: Checksum | None = Field(
        default=None,
        pattern=r"^sha256:[0-9a-f]{64}$",
    )
    wireframe: WireframeDocumentV1 | None = None
    visual_blueprint: VisualBlueprintDocumentV1 | None = None


class BuilderRevisionGlobalSectionOut(BaseSchema):
    item_id: PublicUUID
    content_version_id: PublicUUID
    version_number: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=256)
    summary: str | None = None
    locale: str = Field(min_length=1, max_length=16)
    slug: str = Field(min_length=1, max_length=256)
    purpose: str | None = None
    section_intents: tuple[BuilderSectionIntentV1, ...] = ()
    wireframe_traceability: BuilderWireframeTraceabilityOut
    wireframe_checksum: Checksum | None = Field(
        default=None,
        pattern=r"^sha256:[0-9a-f]{64}$",
    )
    wireframe: WireframeDocumentV1 | None = None
    visual_blueprint: VisualBlueprintDocumentV1 | None = None


class BuilderRevisionOut(BaseSchema):
    site_revision: SiteRevisionManifestV1
    status: SiteRevisionStatusOut
    content_structure_revision: ContentStructureRevisionOut
    pages: tuple[BuilderRevisionPageOut, ...]
    global_sections: tuple[BuilderRevisionGlobalSectionOut, ...] = ()
    global_section_graph: BuilderGlobalSectionDependencyGraphOut = Field(
        default_factory=BuilderGlobalSectionDependencyGraphOut
    )


class BuilderDesignTokenOut(BaseSchema):
    path: str = Field(min_length=1, max_length=256)
    type: TokenValueType
    resolved_value: JsonValue
    deprecated: bool = False
    replacement: str | None = None


class BuilderComponentCatalogOut(BaseSchema):
    site_revision_id: PublicUUID
    design_system_version_id: PublicUUID
    design_system_manifest_checksum: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    default_theme_key: str = Field(min_length=1, max_length=64)
    breakpoints: dict[str, str] = Field(default_factory=dict, max_length=16)
    design_tokens: tuple[BuilderDesignTokenOut, ...] = ()
    catalog: ComponentCatalogV1


class ProjectAuthoringAuthorityOut(BaseSchema):
    mode: ProjectAuthoringMode | None
    state: ProjectAuthoringState
    revision: int = Field(ge=1)


class BuilderInitializationRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    site_id: PublicUUID
    environment_id: PublicUUID
    expected_authoring_revision: int = Field(ge=1)
    expected_design_system_assignment_revision: int = Field(ge=1)
    expected_design_system_version_id: PublicUUID
    expected_design_system_manifest_checksum: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    provenance_source: BuilderProvenanceSource = BuilderProvenanceSource.HUMAN
    agent_run_id: PublicUUID | None = None

    @model_validator(mode="after")
    def require_agent_provenance(self) -> BuilderInitializationRequest:
        if self.provenance_source == BuilderProvenanceSource.AGENT and self.agent_run_id is None:
            raise ValueError("agentRunId is required for agent provenance")
        if self.provenance_source != BuilderProvenanceSource.AGENT and self.agent_run_id is not None:
            raise ValueError("agentRunId is only valid for agent provenance")
        return self


class BuilderInitializationOut(BaseSchema):
    authoring_authority: ProjectAuthoringAuthorityOut
    content_structure_revision: ContentStructureRevisionOut
    site_revision: SiteRevisionManifestV1
    status: SiteRevisionStatusOut


class ProjectBuilderProjectionOut(BaseSchema):
    project_id: PublicUUID
    workspace_id: PublicUUID
    authoring_authority: ProjectAuthoringAuthorityOut
    primary_site_id: PublicUUID | None
    default_preview_environment_id: PublicUUID | None
    current_site_revision: SiteRevisionManifestV1 | None
    current_status: SiteRevisionStatusOut | None
    initialization_required: bool
    blockers: tuple[str, ...]
