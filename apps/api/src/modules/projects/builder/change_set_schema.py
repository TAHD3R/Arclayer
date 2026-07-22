from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.builder._enums import (
    BuilderApprovalClass,
    BuilderApprovalStatus,
    BuilderChangeSetStatus,
    BuilderProvenanceSource,
)
from src.modules.projects.builder.change_set_operation_schema import BuilderOperationBaseV1
from src.modules.projects.builder.design_change_set_schema import (
    BuilderDesignCandidateV1,
    BuilderDesignInitializeOperationV1,
    BuilderDesignResponsiveStyleClearOperationV1,
    BuilderDesignResponsiveStyleSetOperationV1,
    BuilderDesignStyleClearOperationV1,
    BuilderDesignStyleSetOperationV1,
    BuilderDesignTargetOperationV1,
)
from src.modules.projects.builder.design_system_change_set_schema import BuilderDesignSystemRefreshOperationV1
from src.modules.projects.builder.global_section_schema import BuilderGlobalSectionDependencyGraphOut
from src.modules.projects.builder.schema import (
    BuilderSectionIntentV1,
    ContentStructureRevisionOut,
    SiteRevisionManifestV1,
)
from src.modules.projects.builder.wireframe_change_set_schema import (
    BuilderWireframeClearBindingOperationV1,
    BuilderWireframeClearGlobalReferenceOperationV1,
    BuilderWireframeClearResponsiveRuleOperationV1,
    BuilderWireframeInitializeOperationV1,
    BuilderWireframeSectionAddOperationV1,
    BuilderWireframeSectionConfigureOperationV1,
    BuilderWireframeSectionDuplicateOperationV1,
    BuilderWireframeSectionRemoveOperationV1,
    BuilderWireframeSectionReorderOperationV1,
    BuilderWireframeSetBindingOperationV1,
    BuilderWireframeSetComponentOperationV1,
    BuilderWireframeSetGlobalReferenceOperationV1,
    BuilderWireframeSetInteractionsOperationV1,
    BuilderWireframeSetResponsiveRuleOperationV1,
    BuilderWireframeSetVariantOperationV1,
    BuilderWireframeTargetOperationV1,
)
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.projects.content.routing.schema import RoutePrimarySourceIn

Checksum = str


class BuilderPageCreateOperationV1(BuilderOperationBaseV1):
    type: Literal["page.create"]
    client_page_id: str = Field(min_length=1, max_length=96)
    model_key: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=256)
    slug: str = Field(min_length=1, max_length=256)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    parent_item_id: PublicUUID | None = None
    sort_order: int = 0
    path: str = Field(min_length=1, max_length=512)
    fields_snapshot: JsonObject = Field(default_factory=dict)
    purpose: str | None = Field(default=None, min_length=1, max_length=1000)
    section_intents: tuple[BuilderSectionIntentV1, ...] = Field(default=(), max_length=100)

    @model_validator(mode="after")
    def require_unique_intent_ids(self) -> Self:
        _require_unique_intent_ids(self.section_intents)
        if self.section_intents and self.purpose is None:
            raise ValueError("purpose is required when page.create includes section intents")
        return self


class BuilderPageRenameOperationV1(BuilderOperationBaseV1):
    type: Literal["page.rename"]
    item_id: PublicUUID
    expected_draft_version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=256)


class BuilderPageMoveOperationV1(BuilderOperationBaseV1):
    type: Literal["page.move"]
    item_id: PublicUUID
    parent_item_id: PublicUUID | None = None
    sort_order: int = 0


class BuilderPageReorderOperationV1(BuilderOperationBaseV1):
    type: Literal["page.reorder"]
    item_id: PublicUUID
    sort_order: int


class BuilderPageDeleteOperationV1(BuilderOperationBaseV1):
    type: Literal["page.delete"]
    item_id: PublicUUID
    expected_draft_version: int = Field(ge=1)


class BuilderGlobalSectionCreateOperationV1(BuilderOperationBaseV1):
    type: Literal["global_section.create"]
    client_global_section_id: str = Field(min_length=1, max_length=96)
    title: str = Field(min_length=1, max_length=256)
    slug: str = Field(min_length=1, max_length=256)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    fields_snapshot: JsonObject = Field(default_factory=dict)
    purpose: str | None = Field(default=None, min_length=1, max_length=1000)
    section_intents: tuple[BuilderSectionIntentV1, ...] = Field(default=(), max_length=100)

    @model_validator(mode="after")
    def require_valid_planning(self) -> Self:
        _require_unique_intent_ids(self.section_intents)
        if self.section_intents and self.purpose is None:
            raise ValueError("purpose is required when global_section.create includes section intents")
        return self


class BuilderGlobalSectionDeleteOperationV1(BuilderOperationBaseV1):
    type: Literal["global_section.delete"]
    item_id: PublicUUID
    expected_draft_version: int = Field(ge=1)


class BuilderPageIntentReplaceOperationV1(BuilderOperationBaseV1):
    type: Literal["page.intent.replace"]
    item_id: PublicUUID
    purpose: str = Field(min_length=1, max_length=1000)
    section_intents: tuple[BuilderSectionIntentV1, ...] = Field(default=(), max_length=100)

    @model_validator(mode="after")
    def require_unique_intent_ids(self) -> Self:
        _require_unique_intent_ids(self.section_intents)
        return self


class BuilderGlobalSectionIntentReplaceOperationV1(BuilderOperationBaseV1):
    type: Literal["global_section.intent.replace"]
    item_id: PublicUUID
    purpose: str = Field(min_length=1, max_length=1000)
    section_intents: tuple[BuilderSectionIntentV1, ...] = Field(default=(), max_length=100)

    @model_validator(mode="after")
    def require_unique_intent_ids(self) -> Self:
        _require_unique_intent_ids(self.section_intents)
        return self


class BuilderRouteSetOperationV1(BuilderOperationBaseV1):
    type: Literal["route.set"]
    item_id: PublicUUID
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    path: str = Field(min_length=1, max_length=512)
    route_mode: Literal["static", "dynamic"] | None = None
    route_priority: int = 0
    primary_source: RoutePrimarySourceIn | None = None


class BuilderRouteDisableOperationV1(BuilderOperationBaseV1):
    type: Literal["route.disable"]
    item_id: PublicUUID
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)


BuilderSitemapOperationV1 = Annotated[
    BuilderPageCreateOperationV1
    | BuilderPageRenameOperationV1
    | BuilderPageMoveOperationV1
    | BuilderPageReorderOperationV1
    | BuilderPageDeleteOperationV1
    | BuilderGlobalSectionCreateOperationV1
    | BuilderGlobalSectionDeleteOperationV1
    | BuilderPageIntentReplaceOperationV1
    | BuilderGlobalSectionIntentReplaceOperationV1
    | BuilderRouteSetOperationV1
    | BuilderRouteDisableOperationV1,
    Field(discriminator="type"),
]

BuilderOperationV1 = Annotated[
    BuilderPageCreateOperationV1
    | BuilderPageRenameOperationV1
    | BuilderPageMoveOperationV1
    | BuilderPageReorderOperationV1
    | BuilderPageDeleteOperationV1
    | BuilderGlobalSectionCreateOperationV1
    | BuilderGlobalSectionDeleteOperationV1
    | BuilderPageIntentReplaceOperationV1
    | BuilderGlobalSectionIntentReplaceOperationV1
    | BuilderRouteSetOperationV1
    | BuilderRouteDisableOperationV1
    | BuilderWireframeInitializeOperationV1
    | BuilderWireframeSectionAddOperationV1
    | BuilderWireframeSectionDuplicateOperationV1
    | BuilderWireframeSectionRemoveOperationV1
    | BuilderWireframeSectionReorderOperationV1
    | BuilderWireframeSectionConfigureOperationV1
    | BuilderWireframeSetComponentOperationV1
    | BuilderWireframeSetVariantOperationV1
    | BuilderWireframeSetBindingOperationV1
    | BuilderWireframeClearBindingOperationV1
    | BuilderWireframeSetResponsiveRuleOperationV1
    | BuilderWireframeClearResponsiveRuleOperationV1
    | BuilderWireframeSetInteractionsOperationV1
    | BuilderWireframeSetGlobalReferenceOperationV1
    | BuilderWireframeClearGlobalReferenceOperationV1
    | BuilderDesignInitializeOperationV1
    | BuilderDesignStyleSetOperationV1
    | BuilderDesignStyleClearOperationV1
    | BuilderDesignResponsiveStyleSetOperationV1
    | BuilderDesignResponsiveStyleClearOperationV1
    | BuilderDesignSystemRefreshOperationV1,
    Field(discriminator="type"),
]


class BuilderChangeSetPreviewRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    base_revision_id: PublicUUID
    base_etag: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    operations: tuple[BuilderOperationV1, ...] = Field(min_length=1, max_length=100)
    provenance_source: Literal["human", "agent"] = "human"
    agent_run_id: PublicUUID | None = None
    agent_id: PublicUUID | None = None
    tool_name: str | None = Field(default=None, min_length=1, max_length=128)
    expires_in_seconds: int = Field(default=3600, ge=60, le=86_400)

    @model_validator(mode="after")
    def validate_operation_and_provenance_identity(self) -> Self:
        operation_ids = [operation.operation_id for operation in self.operations]
        if len(operation_ids) != len(set(operation_ids)):
            raise ValueError("operationId values must be unique")
        client_page_ids = [
            operation.client_page_id
            for operation in self.operations
            if isinstance(operation, BuilderPageCreateOperationV1)
        ]
        if len(client_page_ids) != len(set(client_page_ids)):
            raise ValueError("clientPageId values must be unique")
        client_global_section_ids = [
            operation.client_global_section_id
            for operation in self.operations
            if isinstance(operation, BuilderGlobalSectionCreateOperationV1)
        ]
        if len(client_global_section_ids) != len(set(client_global_section_ids)):
            raise ValueError("clientGlobalSectionId values must be unique")
        operation_families = {
            (
                "wireframe"
                if isinstance(operation, BuilderWireframeTargetOperationV1)
                else "design"
                if isinstance(operation, BuilderDesignTargetOperationV1)
                else "design_system"
                if isinstance(operation, BuilderDesignSystemRefreshOperationV1)
                else "sitemap"
            )
            for operation in self.operations
        }
        if len(operation_families) != 1:
            raise ValueError("Builder ChangeSets cannot mix Sitemap, Wireframe, Design, and Design System operations")
        if "design_system" in operation_families and len(self.operations) != 1:
            raise ValueError("A Design System refresh ChangeSet requires exactly one operation")
        is_agent = self.provenance_source == BuilderProvenanceSource.AGENT
        if is_agent and ((self.agent_run_id is None) == (self.agent_id is None) or self.tool_name is None):
            raise ValueError("exactly one of agentRunId or agentId and toolName are required for agent provenance")
        if not is_agent and (self.agent_run_id is not None or self.agent_id is not None or self.tool_name is not None):
            raise ValueError("Agent identity and toolName are only valid for agent provenance")
        return self


class BuilderChangeSetAffectedTargetV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal[
        "content_item",
        "route",
        "hierarchy",
        "content_model",
        "presentation",
        "design_system",
        "planning",
        "global_section",
    ]
    target_id: PublicUUID | None = None
    client_target_id: str | None = Field(default=None, min_length=1, max_length=96)
    target_key: str | None = Field(default=None, min_length=1, max_length=160)
    operation_ids: tuple[str, ...]

    @model_validator(mode="after")
    def require_single_target_identity(self) -> Self:
        identities = (self.target_id, self.client_target_id, self.target_key)
        if sum(value is not None for value in identities) != 1:
            raise ValueError("affected target must provide exactly one target identity")
        if self.kind == "content_model" and self.target_key is None:
            raise ValueError("content_model affected targets require targetKey")
        if self.kind != "content_model" and self.target_key is not None:
            raise ValueError("targetKey is only valid for content_model affected targets")
        return self


def _require_unique_intent_ids(section_intents: tuple[BuilderSectionIntentV1, ...]) -> None:
    intent_ids = [intent.id for intent in section_intents]
    if len(intent_ids) != len(set(intent_ids)):
        raise ValueError("section intent ids must be unique within a page")


class BuilderChangeSetIssueV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    severity: Literal["info", "warning", "blocker"]
    code: str = Field(min_length=1, max_length=96)
    message_key: str = Field(min_length=1, max_length=128)
    operation_id: str | None = Field(default=None, min_length=1, max_length=96)
    meta: JsonObject = Field(default_factory=dict)


class BuilderChangeSetApprovalOut(BaseSchema):
    approval_id: PublicUUID
    approval_class: BuilderApprovalClass
    status: BuilderApprovalStatus
    expires_at: datetime


class BuilderWireframeCandidateV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    item_id: PublicUUID
    host_kind: Literal["page", "global_section"] = "page"
    base_content_version_id: PublicUUID
    base_version_number: int = Field(ge=1)
    wireframe: WireframeDocumentV1


class BuilderChangeSetPreviewOut(BaseSchema):
    change_set_id: PublicUUID
    status: BuilderChangeSetStatus
    base_revision_id: PublicUUID
    base_etag: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    operations: tuple[BuilderOperationV1, ...]
    operations_hash: Checksum = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    affected_targets: tuple[BuilderChangeSetAffectedTargetV1, ...]
    issues: tuple[BuilderChangeSetIssueV1, ...]
    required_permissions: tuple[str, ...]
    approval_class: BuilderApprovalClass
    approval: BuilderChangeSetApprovalOut | None = None
    preview_ref: str = Field(min_length=1, max_length=512)
    preview_token: str = Field(min_length=1)
    expires_at: datetime
    summary_key: str = Field(min_length=1, max_length=128)
    summary_params: JsonObject
    wireframe_candidates: tuple[BuilderWireframeCandidateV1, ...] = ()
    design_candidates: tuple[BuilderDesignCandidateV1, ...] = ()
    global_section_graph: BuilderGlobalSectionDependencyGraphOut = Field(
        default_factory=BuilderGlobalSectionDependencyGraphOut
    )


class BuilderChangeSetApprovalDecisionIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    approval_id: PublicUUID
    decision: Literal["approve"]
    expected_approval_class: BuilderApprovalClass


class BuilderChangeSetApplyRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    preview_token: str = Field(min_length=1)
    approval: BuilderChangeSetApprovalDecisionIn | None = None


class BuilderChangeSetApplyOut(BaseSchema):
    change_set_id: PublicUUID
    status: BuilderChangeSetStatus
    base_revision_id: PublicUUID
    content_structure_revision: ContentStructureRevisionOut
    site_revision: SiteRevisionManifestV1
    client_page_ids: dict[str, PublicUUID] = Field(default_factory=dict)
    client_global_section_ids: dict[str, PublicUUID] = Field(default_factory=dict)
    approval: BuilderChangeSetApprovalOut | None = None
    applied_at: datetime
