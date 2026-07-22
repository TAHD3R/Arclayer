from __future__ import annotations

from datetime import datetime
from typing import Literal, Self

from pydantic import Field, model_validator

from src.common.types.json_types import JsonObject, JsonValue
from src.modules.ai.runtime_protocol_schema import AgentEventEnvelopeV1, StrictProtocolSchema, _require_utc


class ApprovalRiskV1(StrictProtocolSchema):
    side_effect_class: Literal["read", "draft_write", "external_write", "publish", "destructive"]
    summary_key: str = Field(min_length=1, max_length=256)
    summary_params: JsonObject
    preview_ref: str | None = Field(default=None, max_length=512)


class ApprovalOptionV1(StrictProtocolSchema):
    id: str = Field(min_length=1, max_length=192)
    kind: Literal["allow-once", "allow-always", "reject-once", "reject-always"]
    label_key: str = Field(min_length=1, max_length=256)
    description_key: str = Field(min_length=1, max_length=256)
    grants: tuple[JsonValue, ...]
    confirm: bool


class ApprovalV1(StrictProtocolSchema):
    approval_id: str = Field(min_length=1, max_length=192)
    approval_version: int = Field(ge=1)
    tool_call_id: str = Field(min_length=1, max_length=192)
    checkpoint_id: str = Field(min_length=1, max_length=192)
    status: Literal["pending", "approved", "rejected", "cancelled", "expired"]
    requested_at: datetime
    expires_at: datetime
    policy_version: str = Field(min_length=1, max_length=192)
    risk: ApprovalRiskV1
    options: tuple[ApprovalOptionV1, ...]

    @model_validator(mode="after")
    def require_valid_timeline_and_options(self) -> Self:
        _require_utc(self.requested_at, field_alias="requestedAt")
        _require_utc(self.expires_at, field_alias="expiresAt")
        if self.expires_at <= self.requested_at:
            raise ValueError("expiresAt must be later than requestedAt")
        option_ids = [option.id for option in self.options]
        if len(option_ids) != len(set(option_ids)):
            raise ValueError("approval option ids must be unique")
        if self.status == "pending" and not self.options:
            raise ValueError("pending approval must expose at least one option")
        return self


class ApprovalEventEnvelopeV1(AgentEventEnvelopeV1):
    span_id: str = Field(min_length=1, max_length=192)
    parent_span_id: str = Field(min_length=1, max_length=192)


class ApprovalRequiredDataV1(StrictProtocolSchema):
    approval: ApprovalV1
    message_id: str = Field(min_length=1, max_length=192)
    part_id: str = Field(min_length=1, max_length=192)

    @model_validator(mode="after")
    def require_pending_approval(self) -> Self:
        if self.approval.status != "pending":
            raise ValueError("approval.required must carry a pending approval")
        return self


class ApprovalRequiredEventV1(ApprovalEventEnvelopeV1):
    type: Literal["approval.required"]
    data: ApprovalRequiredDataV1


class ApprovalResolvedDataV1(StrictProtocolSchema):
    approval: ApprovalV1
    resolved_at: datetime
    resolved_by_actor_id: str = Field(min_length=1, max_length=192)

    @model_validator(mode="after")
    def require_resolution(self) -> Self:
        _require_utc(self.resolved_at, field_alias="resolvedAt")
        if self.approval.status == "pending":
            raise ValueError("approval.resolved cannot carry a pending approval")
        if self.resolved_at < self.approval.requested_at:
            raise ValueError("resolvedAt cannot precede requestedAt")
        if self.approval.status == "expired" and self.resolved_at < self.approval.expires_at:
            raise ValueError("expired approval cannot resolve before expiresAt")
        if self.approval.status in {"approved", "rejected"} and self.resolved_at >= self.approval.expires_at:
            raise ValueError("approval decision cannot resolve at or after expiresAt")
        return self


class ApprovalResolvedEventV1(ApprovalEventEnvelopeV1):
    type: Literal["approval.resolved"]
    data: ApprovalResolvedDataV1


class RunInterruptedDataV1(StrictProtocolSchema):
    interrupt_id: str = Field(min_length=1, max_length=192)
    checkpoint_id: str = Field(min_length=1, max_length=192)
    reason: Literal["approval_required", "human_tool_input"]
    approval_id: str | None = Field(default=None, min_length=1, max_length=192, exclude_if=lambda value: value is None)
    tool_call_id: str = Field(min_length=1, max_length=192)

    @model_validator(mode="after")
    def require_reason_specific_approval(self) -> Self:
        if self.reason == "approval_required" and self.approval_id is None:
            raise ValueError("approval_required interrupt must reference approvalId")
        if self.reason == "human_tool_input" and self.approval_id is not None:
            raise ValueError("human Tool interrupt cannot reference approvalId")
        return self


class RunInterruptedEventV1(AgentEventEnvelopeV1):
    type: Literal["run.interrupted"]
    data: RunInterruptedDataV1


class RunResumedDataV1(StrictProtocolSchema):
    interrupt_id: str = Field(min_length=1, max_length=192)
    checkpoint_id: str = Field(min_length=1, max_length=192)
    resumed_at: datetime
    resume_kind: Literal["approval", "human_result"]

    @model_validator(mode="after")
    def require_utc_resumed_at(self) -> Self:
        _require_utc(self.resumed_at, field_alias="resumedAt")
        return self


class RunResumedEventV1(AgentEventEnvelopeV1):
    type: Literal["run.resumed"]
    data: RunResumedDataV1


ApprovalProjectionEventV1 = ApprovalRequiredEventV1 | ApprovalResolvedEventV1
InterruptProjectionEventV1 = RunInterruptedEventV1 | RunResumedEventV1
