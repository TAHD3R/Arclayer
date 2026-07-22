from __future__ import annotations

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue
from src.common.types.public_uuid import PublicUUID
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.ai.runtime_approval_protocol_schema import ApprovalOptionV1, ApprovalRiskV1
from src.modules.ai.runtime_output_protocol_schema import ChangeSetWarningV1, SettlementV1, UsageV1
from src.modules.ai.runtime_protocol_schema import ArtifactRefV1, PublicErrorV1, StrictProtocolSchema


class AgentRunSnapshotScopeV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    project_id: UUID | None
    thread_id: UUID
    run_id: UUID
    owner_user_id: UUID


class AgentThreadSnapshotV1(StrictProtocolSchema):
    thread_id: PublicUUID
    workspace_id: PublicUUID
    project_id: PublicUUID | None
    owner_user_id: PublicUUID
    lead_agent_id: PublicUUID
    lead_agent_version_id: PublicUUID
    lead_agent_assignment_id: PublicUUID
    title: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AgentRunInterruptSnapshotV1(StrictProtocolSchema):
    interrupt_id: str
    checkpoint_id: str
    reason: Literal["approval_required", "human_tool_input"]
    approval_id: str | None
    tool_call_id: str


class AgentRunStateSnapshotV1(StrictProtocolSchema):
    run_id: PublicUUID
    workspace_id: PublicUUID
    project_id: PublicUUID | None
    thread_id: PublicUUID
    owner_user_id: PublicUUID
    execution_mode: Literal["plan", "build"]
    lead_agent_id: PublicUUID
    lead_agent_version_id: PublicUUID
    lead_agent_assignment_id: PublicUUID
    mentioned_agent_ids: tuple[PublicUUID, ...]
    mentioned_agent_version_ids: tuple[PublicUUID, ...]
    mentioned_agent_assignment_ids: tuple[PublicUUID, ...]
    site_revision_id: PublicUUID | None
    status: Literal[
        "created",
        "queued",
        "running",
        "cancellation_requested",
        "interrupted",
        "completed",
        "cancelled",
        "failed",
    ]
    correlation_id: str
    cancellation_requested_at: datetime | None
    interrupt: AgentRunInterruptSnapshotV1 | None
    terminal_at: datetime | None
    settlement: SettlementV1 | None
    created_at: datetime
    updated_at: datetime


class AgentMessagePartSnapshotV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    part_id: PublicUUID
    part_index: int = Field(ge=0)
    type: Literal["text", "source", "file", "image", "tool-call", "error"]
    status: Literal["running", "requires_action", "complete", "incomplete", "failed"]
    text: str | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    tool_id: str | None = None
    tool_version: str | None = None
    args: JsonObject | None = None
    args_text: str | None = None
    started_at: datetime | None = None
    progress: JsonObject | None = None
    completed_at: datetime | None = None
    failed_at: datetime | None = None
    result: JsonValue = None
    result_ref: str | None = None
    artifact_refs: tuple[ArtifactRefV1, ...] = ()
    approval: JsonObject | None = None
    error: PublicErrorV1 | None = None
    url: str | None = None
    name: str | None = None
    alt: str | None = None
    mime_type: str | None = None
    source_id: str | None = None
    title: str | None = None

    @model_validator(mode="after")
    def require_type_payload(self) -> Self:
        if self.type == "text" and self.text is None:
            raise ValueError("text snapshot parts require text")
        if self.type == "tool-call" and any(
            value is None for value in (self.tool_call_id, self.tool_name, self.args, self.args_text)
        ):
            raise ValueError("Tool snapshot parts require canonical Tool identity and arguments")
        if self.type == "error" and self.error is None:
            raise ValueError("error snapshot parts require a public error")
        return self


class AgentMessageSnapshotV1(StrictProtocolSchema):
    message_id: PublicUUID
    role: Literal["assistant", "user"]
    status: Literal["running", "complete", "incomplete", "failed"]
    agent_id: str | None = None
    actor_user_id: PublicUUID | None = None
    created_at: datetime
    placement: JsonObject
    parts: tuple[AgentMessagePartSnapshotV1, ...]

    @model_validator(mode="after")
    def require_role_identity(self) -> Self:
        if self.role == "assistant" and (self.agent_id is None or self.actor_user_id is not None):
            raise ValueError("assistant snapshots require only agentId")
        if self.role == "user" and (self.actor_user_id is None or self.agent_id is not None):
            raise ValueError("user snapshots require only actorUserId")
        return self


class AgentPendingApprovalSnapshotV1(StrictProtocolSchema):
    approval_id: str
    approval_version: int = Field(ge=1)
    message_id: PublicUUID
    part_id: PublicUUID
    tool_call_id: str
    checkpoint_id: str
    status: Literal["pending"]
    requested_at: datetime
    expires_at: datetime
    policy_version: str
    risk: ApprovalRiskV1
    options: tuple[ApprovalOptionV1, ...]


class AgentDelegationSnapshotV1(StrictProtocolSchema):
    delegation_id: str
    parent_tool_call_id: str
    child_run_id: PublicUUID
    source_agent_version_id: str
    target_agent_version_id: str
    status: Literal["delegated", "completed", "failed"]
    delegated_at: datetime
    completed_at: datetime | None
    failed_at: datetime | None
    objective_summary: str
    summary: str | None
    artifact_refs: tuple[ArtifactRefV1, ...]
    error: PublicErrorV1 | None


class AgentChangeSetSnapshotV1(StrictProtocolSchema):
    change_set_id: str
    base_revision_id: str
    preview_ref: str
    summary_key: str
    summary_params: JsonObject
    warnings: tuple[ChangeSetWarningV1, ...]
    required_approval_ids: tuple[str, ...]


class AgentRunSnapshotV1(StrictProtocolSchema):
    snapshot_version: Literal[1]
    run_id: PublicUUID
    thread_id: PublicUUID
    thread: AgentThreadSnapshotV1
    run: AgentRunStateSnapshotV1
    design_system_context: AgentRunDesignSystemContextV1 | None
    messages: tuple[AgentMessageSnapshotV1, ...]
    pending_approvals: tuple[AgentPendingApprovalSnapshotV1, ...]
    delegations: tuple[AgentDelegationSnapshotV1, ...]
    change_sets: tuple[AgentChangeSetSnapshotV1, ...]
    artifact_refs: tuple[ArtifactRefV1, ...]
    usage: UsageV1 | None
    error: PublicErrorV1 | None
    terminal: bool
    last_sequence: int = Field(ge=1)
    last_cursor: str
    minimum_replay_sequence: int = Field(ge=1)
    minimum_replay_cursor: str | None

    @model_validator(mode="after")
    def require_consistent_high_water(self) -> Self:
        is_terminal = self.run.status in {"completed", "cancelled", "failed"}
        if self.terminal != is_terminal or self.last_sequence < self.minimum_replay_sequence:
            raise ValueError("snapshot terminal or replay high-water is inconsistent")
        if self.minimum_replay_sequence == 1 and self.minimum_replay_cursor is not None:
            raise ValueError("minimumReplayCursor must be null while history starts at sequence 1")
        if self.minimum_replay_sequence > 1 and self.minimum_replay_cursor is None:
            raise ValueError("retained event prefixes require a boundary cursor")
        return self
