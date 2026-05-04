from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject

TRANSFER_SCHEMA_VERSION = 1

TransferDiagnosticSeverity = Literal["info", "warning", "blocking"]
TransferPhaseState = Literal["planned", "completed", "failed"]
TransferResourceName = Literal[
    "workspace",
    "project",
    "runtime",
    "site",
    "content_models",
    "content_model_fields",
    "content_model_relations",
    "content_model_views",
    "content_items",
    "content_versions",
    "presentation_documents",
    "seo_profiles",
    "component_bindings",
    "route_bindings",
    "hierarchy_nodes",
    "releases",
    "published_graph",
    "publish_artifacts",
    "assets",
]


class ContentTransferDiagnostic(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    severity: TransferDiagnosticSeverity = Field(..., description="Diagnostic severity.")
    code: str = Field(..., min_length=1, description="Machine-readable diagnostic code.")
    message: str = Field(..., min_length=1, description="Human-readable diagnostic message.")
    resource: str | None = Field(default=None, description="Optional resource kind.")
    resource_id: str | None = Field(default=None, description="Optional resource identifier.")
    path: str | None = Field(default=None, description="Optional payload path.")
    meta: JsonObject | None = Field(default=None, description="Diagnostic metadata.")


class ContentTransferPhase(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    key: str = Field(..., min_length=1, description="Stable phase key.")
    state: TransferPhaseState = Field(..., description="Phase state.")
    resource: str | None = Field(default=None, description="Primary resource handled by this phase.")
    count: int = Field(default=0, ge=0, description="Resource rows handled by this phase.")
    diagnostics: list[ContentTransferDiagnostic] = Field(default_factory=list, description="Phase diagnostics.")


class ContentTransferProjectIdentity(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    organization_id: str = Field(..., min_length=1, description="Organization id.")
    workspace_id: str = Field(..., min_length=1, description="Workspace id.")
    workspace_name: str | None = Field(default=None, description="Workspace name.")
    project_id: str = Field(..., min_length=1, description="Project id.")
    project_slug: str = Field(..., min_length=1, description="Project slug.")
    project_name: str = Field(..., min_length=1, description="Project name.")
    runtime_id: str | None = Field(default=None, description="Primary runtime id.")
    site_id: str = Field(..., min_length=1, description="Site id.")
    site_slug: str = Field(..., min_length=1, description="Site slug.")
    site_name: str = Field(..., min_length=1, description="Site name.")
    default_locale: str = Field(..., min_length=1, description="Site default locale.")
    fallback_locale: str = Field(..., min_length=1, description="Site fallback locale.")
    environment_id: str | None = Field(default=None, description="Exported environment id.")


class ContentTransferManifest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    schema_version: int = Field(default=TRANSFER_SCHEMA_VERSION, ge=1, description="Transfer schema version.")
    exported_at: datetime = Field(..., description="Export timestamp.")
    project_identity: ContentTransferProjectIdentity = Field(..., description="Source project identity.")
    resource_counts: dict[TransferResourceName, int] = Field(default_factory=dict, description="Resource counts.")
    integrity_checks: dict[str, str] = Field(default_factory=dict, description="Stable resource checksums.")
    phases: list[ContentTransferPhase] = Field(default_factory=list, description="Export or import phases.")
    diagnostics: list[ContentTransferDiagnostic] = Field(default_factory=list, description="Bundle diagnostics.")

    @model_validator(mode="after")
    def validate_schema_version(self) -> ContentTransferManifest:
        if self.schema_version != TRANSFER_SCHEMA_VERSION:
            raise ValueError(f"Unsupported transfer schema version: {self.schema_version}")
        return self


class ContentTransferResourceBundle(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    workspace: JsonObject = Field(default_factory=dict, description="Workspace configuration payload.")
    project: JsonObject = Field(default_factory=dict, description="Project configuration payload.")
    runtime: JsonObject | None = Field(default=None, description="Project runtime payload.")
    site: JsonObject = Field(default_factory=dict, description="Site configuration payload.")
    content_models: list[JsonObject] = Field(default_factory=list, description="Content model records.")
    content_model_fields: list[JsonObject] = Field(default_factory=list, description="Content model fields.")
    content_model_relations: list[JsonObject] = Field(default_factory=list, description="Content model relations.")
    content_model_views: list[JsonObject] = Field(default_factory=list, description="Content model views.")
    content_items: list[JsonObject] = Field(default_factory=list, description="Content items.")
    content_versions: list[JsonObject] = Field(default_factory=list, description="Content item versions.")
    presentation_documents: list[JsonObject] = Field(default_factory=list, description="Presentation documents.")
    seo_profiles: list[JsonObject] = Field(default_factory=list, description="SEO profiles.")
    component_bindings: list[JsonObject] = Field(default_factory=list, description="Component bindings.")
    route_bindings: list[JsonObject] = Field(default_factory=list, description="Route bindings.")
    hierarchy_nodes: list[JsonObject] = Field(default_factory=list, description="Hierarchy nodes.")
    releases: list[JsonObject] = Field(default_factory=list, description="Content releases.")
    published_graph: list[JsonObject] = Field(default_factory=list, description="Published graph rows.")
    publish_artifacts: list[JsonObject] = Field(default_factory=list, description="Publish artifact rows.")
    assets: list[JsonObject] = Field(default_factory=list, description="Asset metadata rows.")


class ContentTransferBundle(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    manifest: ContentTransferManifest = Field(..., description="Transfer manifest.")
    resources: ContentTransferResourceBundle = Field(..., description="Transfer resource payload.")


class ContentTransferExportResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    bundle: ContentTransferBundle = Field(..., description="Exported transfer bundle.")
    diagnostics: list[ContentTransferDiagnostic] = Field(default_factory=list, description="Export diagnostics.")


class ContentTransferImportResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    manifest: ContentTransferManifest = Field(..., description="Imported transfer manifest.")
    phases: list[ContentTransferPhase] = Field(default_factory=list, description="Import phases.")
    diagnostics: list[ContentTransferDiagnostic] = Field(default_factory=list, description="Import diagnostics.")
