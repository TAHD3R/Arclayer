from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, HttpUrl, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID


class KnowledgeCursorPage[T](BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    items: tuple[T, ...] = Field(default_factory=tuple)
    next_cursor: PublicUUID | None = None


class KnowledgeAccessPolicy(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    visibility: Literal["workspace", "restricted"] = "workspace"
    allowed_project_ids: tuple[PublicUUID, ...] = Field(default_factory=tuple)
    allowed_role_codes: tuple[str, ...] = Field(default_factory=tuple)
    allowed_member_ids: tuple[PublicUUID, ...] = Field(default_factory=tuple)
    allowed_agent_definition_ids: tuple[PublicUUID, ...] = Field(default_factory=tuple)

    @field_validator(
        "allowed_project_ids",
        "allowed_role_codes",
        "allowed_member_ids",
        "allowed_agent_definition_ids",
    )
    @classmethod
    def _require_unique_values(cls, values: tuple[object, ...]) -> tuple[object, ...]:
        if len(values) != len(set(values)):
            raise ValueError("Policy allowlists must contain unique values")
        return values

    @model_validator(mode="after")
    def _workspace_visibility_has_no_allowlists(self) -> Self:
        if self.visibility == "workspace" and any((
            self.allowed_project_ids,
            self.allowed_role_codes,
            self.allowed_member_ids,
            self.allowed_agent_definition_ids,
        )):
            raise ValueError("Workspace visibility cannot contain restricted allowlists")
        return self


class KnowledgeBaseCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1000)
    default_locale: str = Field(default="en-US", min_length=2, max_length=32)
    access_policy: KnowledgeAccessPolicy = Field(default_factory=KnowledgeAccessPolicy)


class KnowledgeBaseUpdateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1000)
    default_locale: str | None = Field(default=None, min_length=2, max_length=32)
    status: Literal["active", "disabled"] | None = None
    access_policy: KnowledgeAccessPolicy | None = None

    @model_validator(mode="after")
    def _require_change(self) -> Self:
        changed_fields = self.model_fields_set - {"expected_revision"}
        if not changed_fields:
            raise ValueError("At least one Knowledge Base field is required")
        return self


class KnowledgeBaseSummaryOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    name: str
    description: str | None
    default_locale: str
    status: str
    policy_revision: int
    metadata_revision: int
    source_count: int = Field(ge=0)
    ready_source_count: int = Field(ge=0)
    created_by_user_id: PublicUUID | None
    updated_by_user_id: PublicUUID | None
    created_at: datetime
    updated_at: datetime


class KnowledgeBaseDetailOut(KnowledgeBaseSummaryOut):
    access_policy: KnowledgeAccessPolicy


class ManualKnowledgeLocator(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["manual"]
    document_key: str | None = Field(default=None, min_length=1, max_length=128)


class FileKnowledgeLocator(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["file"]
    asset_id: PublicUUID


class UrlKnowledgeLocator(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["url"]
    url: HttpUrl


class ConnectorKnowledgeLocator(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["connector"]
    connector_installation_id: PublicUUID
    provider_object_reference: str = Field(min_length=1, max_length=512)


class StructuredContentKnowledgeLocator(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["structured_content"]
    project_id: PublicUUID
    content_reference: JsonObject


KnowledgeSourceLocator = Annotated[
    ManualKnowledgeLocator
    | FileKnowledgeLocator
    | UrlKnowledgeLocator
    | ConnectorKnowledgeLocator
    | StructuredContentKnowledgeLocator,
    Field(discriminator="kind"),
]


class KnowledgeSourceCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=160)
    locale: str = Field(default="en-US", min_length=2, max_length=32)
    locator: KnowledgeSourceLocator


class KnowledgeSourceUpdateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    locale: str | None = Field(default=None, min_length=2, max_length=32)
    enabled: bool | None = None

    @model_validator(mode="after")
    def _require_change(self) -> Self:
        if not (self.model_fields_set - {"expected_revision"}):
            raise ValueError("At least one Knowledge Source field is required")
        return self


class KnowledgeSourceOut(BaseSchema):
    id: PublicUUID
    knowledge_base_id: PublicUUID
    workspace_id: PublicUUID
    source_kind: str
    display_name: str
    locale: str
    status: str
    locator: KnowledgeSourceLocator
    active_ready_version_id: PublicUUID | None
    latest_candidate_version_id: PublicUUID | None
    serving_freshness: str
    safe_error_code: str | None
    metadata_revision: int
    created_by_user_id: PublicUUID | None
    updated_by_user_id: PublicUUID | None
    created_at: datetime
    updated_at: datetime


class ManualKnowledgeVersionCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    content: str = Field(min_length=1)
    title: str | None = Field(default=None, max_length=256)
    locale: str | None = Field(default=None, min_length=2, max_length=32)
    document_metadata: JsonObject = Field(default_factory=dict)


class KnowledgeSourceVersionOut(BaseSchema):
    id: PublicUUID
    source_id: PublicUUID
    workspace_id: PublicUUID
    version_number: int = Field(ge=1)
    status: str
    content_hash: str
    normalized_content_hash: str
    parser_name: str
    parser_version: str
    ingestion_mode: str
    locale: str
    title: str | None
    document_metadata: JsonObject
    chunker_name: str
    chunker_version: str
    index_schema_version: int = Field(ge=1)
    token_count: int | None
    character_count: int | None
    chunk_count: int | None
    provenance_actor_user_id: PublicUUID | None
    provenance_job_id: PublicUUID | None
    index_job_id: PublicUUID | None
    correlation_id: str | None
    created_at: datetime


class KnowledgeSourceIngestionCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    ingestion_mode: Literal["initial", "refresh"]


class KnowledgeSourceIngestionAcceptedOut(BaseSchema):
    source_id: PublicUUID
    job_id: PublicUUID
    ingestion_mode: Literal["initial", "refresh"]
    status: Literal["queued"] = "queued"


class WorkspaceKnowledgeCapabilitiesOut(BaseSchema):
    manual_sources_available: Literal[True]
    external_ingestion_available: bool
    indexing_available: bool
    retrieval_available: bool
    immutable_source_versions: Literal[True]
    supported_source_kinds: tuple[str, ...]


class KnowledgeGuidanceRevisionOut(BaseSchema):
    id: PublicUUID
    guidance_layer_id: PublicUUID
    workspace_id: PublicUUID
    revision_number: int = Field(ge=1)
    content: str
    content_hash: str
    status: Literal["draft", "published", "superseded"]
    restored_from_revision_id: PublicUUID | None
    published_at: datetime | None
    published_by_user_id: PublicUUID | None
    created_by_user_id: PublicUUID | None
    created_at: datetime


class KnowledgeGuidanceReferenceOut(BaseSchema):
    id: PublicUUID
    knowledge_base_id: PublicUUID
    created_by_user_id: PublicUUID | None
    created_at: datetime


class KnowledgeGuidanceLayerOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    scope: Literal["workspace", "project"]
    project_id: PublicUUID | None
    project_mode: Literal["supplement", "override"] | None
    metadata_revision: int = Field(ge=1)
    draft_revision_id: PublicUUID | None
    published_revision_id: PublicUUID | None
    removed_at: datetime | None
    removed_by_user_id: PublicUUID | None
    current_draft: KnowledgeGuidanceRevisionOut | None
    current_published: KnowledgeGuidanceRevisionOut | None
    references: tuple[KnowledgeGuidanceReferenceOut, ...] = Field(default_factory=tuple)
    created_at: datetime
    updated_at: datetime


class KnowledgeGuidanceDraftSaveRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    content: str = Field(min_length=1)
    project_mode: Literal["supplement", "override"] | None = None


class KnowledgeGuidancePublishRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    revision_id: PublicUUID | None = None


class KnowledgeGuidanceReferenceAttachRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    knowledge_base_id: PublicUUID


class KnowledgeGuidanceReferenceDetachRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)


class KnowledgeGuidanceConflictOut(BaseSchema):
    code: Literal["project_override_hides_workspace"]
    message_key: str
    workspace_revision_id: PublicUUID
    project_revision_id: PublicUUID


class KnowledgeGuidanceUnavailableOut(BaseSchema):
    code: Literal[
        "workspace_guidance_unpublished",
        "project_guidance_unpublished",
        "workspace_guidance_removed",
        "project_guidance_removed",
    ]
    message_key: str


class KnowledgeGuidanceEffectivePreviewOut(BaseSchema):
    workspace: KnowledgeGuidanceLayerOut
    project: KnowledgeGuidanceLayerOut | None
    precedence: tuple[Literal["workspace", "project"], ...]
    effective_content: str | None
    conflicts: tuple[KnowledgeGuidanceConflictOut, ...] = Field(default_factory=tuple)
    unavailable: tuple[KnowledgeGuidanceUnavailableOut, ...] = Field(default_factory=tuple)


class KnowledgeGuidanceRestorePreviewRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    source_revision_id: PublicUUID


class KnowledgeGuidanceRemovePreviewRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)


class KnowledgeGuidanceImpactOut(BaseSchema):
    reference_count: int = Field(ge=0)
    source_count: int = Field(ge=0)
    ready_source_count: int = Field(ge=0)
    project_guidance_count: int = Field(ge=0)


class KnowledgeGuidancePreviewOut(BaseSchema):
    id: PublicUUID
    kind: Literal["restore", "remove"]
    guidance_layer_id: PublicUUID
    expected_guidance_revision: int = Field(ge=1)
    preview_revision: int = Field(ge=1)
    source_revision_id: PublicUUID | None
    can_apply: bool
    impact: KnowledgeGuidanceImpactOut
    created_at: datetime


class KnowledgeGuidancePreviewApplyRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_guidance_revision: int = Field(ge=1)
    expected_preview_revision: int = Field(ge=1)
