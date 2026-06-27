from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.agents.approval import AgentApprovalStatus, AgentApprovalTargetType
from src.modules.ai.schema import AIReasoningEffort
from src.modules.projects.content.contracts.schema import ContentModelImpactPreviewOut, ContentVersionOut
from src.modules.projects.content.items.input_schema import ContentPresentationIn
from src.modules.projects.content.models.canonical_service import ContentModelDefinitionPatchContract
from src.modules.projects.content.models.router_helpers import ContentModelMutationOut


class AgentContentApprovalDryRunRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    skill_id: str = Field(default="content.writer", min_length=1, max_length=96)
    tool_name: str | None = Field(default=None, min_length=1, max_length=128)
    action: str = Field(default="content_item.update_draft", min_length=1, max_length=128)
    agent_run_id: PublicUUID | None = None
    target_type: AgentApprovalTargetType = AgentApprovalTargetType.CONTENT_ITEM
    target_id: PublicUUID
    change_summary: str | None = Field(default=None, max_length=512)
    fields_snapshot: JsonObject | None = None
    presentations: list[ContentPresentationIn] | None = None
    expires_in_seconds: int = Field(default=86_400, ge=60, le=604_800)


class AgentContentModelApprovalDryRunRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    skill_id: str = Field(default="content.modeler", min_length=1, max_length=96)
    tool_name: str | None = Field(default=None, min_length=1, max_length=128)
    action: str = Field(default="content_model.update_schema", min_length=1, max_length=128)
    agent_run_id: PublicUUID | None = None
    target_type: AgentApprovalTargetType = AgentApprovalTargetType.CONTENT_MODEL
    target_id: PublicUUID
    expected_draft_revision: int = Field(..., ge=1)
    change_summary: str | None = Field(default=None, max_length=512)
    model_patch: ContentModelDefinitionPatchContract
    impact_preview: ContentModelImpactPreviewOut
    expires_in_seconds: int = Field(default=86_400, ge=60, le=604_800)


class AgentApprovalDecisionRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=512)


class AgentContentApprovalModifyRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    change_summary: str | None = Field(default=None, max_length=512)
    fields_snapshot: JsonObject | None = None
    presentations: list[ContentPresentationIn] | None = None
    model_patch: ContentModelDefinitionPatchContract | None = None

    @model_validator(mode="after")
    def validate_patch_fields(self) -> AgentContentApprovalModifyRequest:
        patch_fields = {"change_summary", "fields_snapshot", "presentations", "model_patch"}
        if not patch_fields.intersection(self.model_fields_set):
            raise ValueError("At least one approval patch field is required.")
        if "fields_snapshot" in self.model_fields_set and self.fields_snapshot is None:
            raise ValueError("fieldsSnapshot must be an object when provided.")
        if "presentations" in self.model_fields_set and self.presentations is None:
            raise ValueError("presentations must be an array when provided.")
        if "model_patch" in self.model_fields_set and self.model_patch is None:
            raise ValueError("modelPatch must be an object when provided.")
        return self


class AgentApprovalOut(BaseSchema):
    id: PublicUUID
    requester_user_id: PublicUUID
    approver_user_id: PublicUUID | None = None
    skill_id: str
    tool_name: str | None = None
    action: str
    target_type: AgentApprovalTargetType
    target_id: PublicUUID | None = None
    expected_draft_version: int | None = None
    target_snapshot: JsonObject = Field(default_factory=dict)
    proposed_patch: JsonObject = Field(default_factory=dict)
    dry_run: JsonObject = Field(default_factory=dict)
    status: AgentApprovalStatus
    expires_at: datetime
    approved_at: datetime | None = None
    rejected_at: datetime | None = None
    expired_at: datetime | None = None
    applied_at: datetime | None = None
    decision_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class AgentApprovalListOut(BaseSchema):
    approvals: list[AgentApprovalOut] = Field(default_factory=list)


class AgentApprovalApplyOut(BaseSchema):
    approval: AgentApprovalOut
    version: ContentVersionOut | None = None
    model: ContentModelMutationOut | None = None


class AgentContentDraftProposalRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    target_id: PublicUUID
    instruction: str = Field(..., min_length=1, max_length=8000)
    model: str | None = Field(default=None, max_length=128)
    reasoning_effort: AIReasoningEffort | None = None
    expires_in_seconds: int = Field(default=86_400, ge=60, le=604_800)


class AgentContentDraftProposalOut(BaseSchema):
    approval: AgentApprovalOut
    model: str
    usage: JsonObject = Field(default_factory=dict)


class AgentContentModelDraftProposalRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    target_id: PublicUUID
    instruction: str = Field(..., min_length=1, max_length=8000)
    model: str | None = Field(default=None, max_length=128)
    reasoning_effort: AIReasoningEffort | None = None
    expires_in_seconds: int = Field(default=86_400, ge=60, le=604_800)


class AgentContentModelDraftProposalOut(BaseSchema):
    approval: AgentApprovalOut
    model: str
    usage: JsonObject = Field(default_factory=dict)
    impact_preview: ContentModelImpactPreviewOut
