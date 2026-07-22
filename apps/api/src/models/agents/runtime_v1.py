from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class AgentExecutionModeV1(StrEnum):
    PLAN = "plan"
    BUILD = "build"


class AgentRunStatusV1(StrEnum):
    CREATED = "created"
    QUEUED = "queued"
    RUNNING = "running"
    CANCELLATION_REQUESTED = "cancellation_requested"
    INTERRUPTED = "interrupted"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class AgentApprovalStatusV1(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class AgentToolResponseKindV1(StrEnum):
    APPROVAL = "approval"
    HUMAN_RESULT = "human_result"


class AgentThreadV1Record(BaseModel):
    workspace = fields.ForeignKeyField("models.Workspace", related_name="ai_threads", on_delete=fields.CASCADE)
    project = fields.ForeignKeyField(
        "models.ProjectRecord", related_name="ai_threads", on_delete=fields.CASCADE, null=True
    )
    owner_user_id = fields.UUIDField(db_index=True)
    creation_idempotency_key = fields.CharField(max_length=192, null=True)
    lead_agent_id = fields.CharField(max_length=160, db_index=True)
    lead_agent_version_id = fields.UUIDField(null=True, db_index=True)
    lead_agent_assignment_id = fields.UUIDField(null=True, db_index=True)
    title = fields.CharField(max_length=160)
    archived_at = fields.DatetimeField(null=True, db_index=True)
    deleted_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "ai_threads"
        unique_together = (("workspace_id", "owner_user_id", "creation_idempotency_key"),)
        indexes = (("workspace_id", "owner_user_id", "updated_at"),)
        abstract = False


class AgentRunV1Record(BaseModel):
    workspace = fields.ForeignKeyField("models.Workspace", related_name="ai_runs", on_delete=fields.CASCADE)
    project = fields.ForeignKeyField(
        "models.ProjectRecord", related_name="ai_runs_v1", on_delete=fields.CASCADE, null=True
    )
    thread = fields.ForeignKeyField("models.AgentThreadV1Record", related_name="runs", on_delete=fields.CASCADE)
    job = fields.OneToOneField(
        "models.BackgroundJobRecord",
        related_name="agent_run",
        on_delete=fields.RESTRICT,
        null=True,
    )
    owner_user_id = fields.UUIDField(db_index=True)
    idempotency_key = fields.CharField(max_length=192)
    execution_mode = fields.CharEnumField(AgentExecutionModeV1, max_length=16)
    lead_agent_id = fields.CharField(max_length=160, db_index=True)
    lead_agent_version_id = fields.UUIDField(null=True, db_index=True)
    lead_agent_assignment_id = fields.UUIDField(null=True, db_index=True)
    mentioned_agent_ids = fields.JSONField(default=list)
    mentioned_agent_version_ids = fields.JSONField(default=list)
    mentioned_agent_assignment_ids = fields.JSONField(default=list)
    site_revision_id = fields.UUIDField(null=True, db_index=True)
    status = fields.CharEnumField(AgentRunStatusV1, max_length=32, db_index=True)
    correlation_id = fields.CharField(max_length=192, db_index=True)
    last_sequence = fields.IntField(default=0)
    last_cursor = fields.CharField(max_length=512, null=True, unique=True)
    minimum_replay_sequence = fields.IntField(default=1)
    minimum_replay_cursor = fields.CharField(max_length=512, null=True)
    cancellation_requested_at = fields.DatetimeField(null=True, db_index=True)
    interrupt_id = fields.CharField(max_length=192, null=True, db_index=True)
    checkpoint_id = fields.CharField(max_length=192, null=True, db_index=True)
    interrupt_reason = fields.CharField(max_length=64, null=True)
    interrupt_approval_id = fields.CharField(max_length=192, null=True, db_index=True)
    interrupt_tool_call_id = fields.CharField(max_length=192, null=True, db_index=True)
    terminal_at = fields.DatetimeField(null=True, db_index=True)
    usage = fields.JSONField(null=True)
    settlement = fields.JSONField(null=True)
    error = fields.JSONField(null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID | None
        thread_id: UUID
        job_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "ai_runs"
        unique_together = (("thread_id", "owner_user_id", "idempotency_key"),)
        indexes = (("workspace_id", "owner_user_id", "status"),)
        abstract = False


class AgentMessageV1Record(BaseModel):
    thread = fields.ForeignKeyField("models.AgentThreadV1Record", related_name="messages", on_delete=fields.CASCADE)
    run = fields.ForeignKeyField("models.AgentRunV1Record", related_name="messages", on_delete=fields.CASCADE)
    role = fields.CharField(max_length=16)
    status = fields.CharField(max_length=32)
    agent_id = fields.CharField(max_length=160, null=True, db_index=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    placement_kind = fields.CharField(max_length=16, default="thread")
    delegation_id = fields.CharField(max_length=192, null=True, db_index=True)
    parent_tool_call_id = fields.CharField(max_length=192, null=True, db_index=True)
    source_run_id = fields.CharField(max_length=192, null=True, db_index=True)

    if TYPE_CHECKING:
        thread_id: UUID
        run_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_messages"
        indexes = (("thread_id", "created_at"), ("run_id", "created_at"))
        abstract = False


class AgentMessagePartV1Record(BaseModel):
    message = fields.ForeignKeyField("models.AgentMessageV1Record", related_name="parts", on_delete=fields.CASCADE)
    part_index = fields.IntField()
    type = fields.CharField(max_length=32, db_index=True)
    status = fields.CharField(max_length=32, db_index=True)
    text = fields.TextField(null=True)
    tool_call_id = fields.CharField(max_length=192, null=True, unique=True)
    payload = fields.JSONField(default=dict)

    if TYPE_CHECKING:
        message_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_message_parts"
        unique_together = (("message_id", "part_index"),)
        abstract = False


class AgentRunEventV1Record(BaseModel):
    run = fields.ForeignKeyField("models.AgentRunV1Record", related_name="events", on_delete=fields.CASCADE)
    event_version = fields.IntField()
    event_id = fields.CharField(max_length=192, unique=True)
    cursor = fields.CharField(max_length=512, unique=True)
    type = fields.CharField(max_length=64, db_index=True)
    sequence = fields.IntField()
    occurred_at = fields.DatetimeField(db_index=True)
    correlation_id = fields.CharField(max_length=192, db_index=True)
    span_id = fields.CharField(max_length=192, null=True, db_index=True)
    parent_span_id = fields.CharField(max_length=192, null=True, db_index=True)
    source_event_id = fields.CharField(max_length=192, null=True, unique=True)
    payload = fields.JSONField()

    if TYPE_CHECKING:
        run_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_run_events"
        unique_together = (("run_id", "sequence"),)
        indexes = (("run_id", "occurred_at"),)
        abstract = False


class AgentApprovalV1Record(BaseModel):
    workspace = fields.ForeignKeyField("models.Workspace", related_name="ai_approvals", on_delete=fields.CASCADE)
    project = fields.ForeignKeyField(
        "models.ProjectRecord", related_name="ai_approvals", on_delete=fields.CASCADE, null=True
    )
    thread = fields.ForeignKeyField("models.AgentThreadV1Record", related_name="approvals", on_delete=fields.CASCADE)
    run = fields.ForeignKeyField("models.AgentRunV1Record", related_name="approvals", on_delete=fields.CASCADE)
    message_part = fields.ForeignKeyField(
        "models.AgentMessagePartV1Record", related_name="approvals", on_delete=fields.CASCADE
    )
    owner_user_id = fields.UUIDField(db_index=True)
    approval_id = fields.CharField(max_length=192, unique=True)
    approval_version = fields.IntField()
    tool_call_id = fields.CharField(max_length=192, db_index=True)
    checkpoint_id = fields.CharField(max_length=192, db_index=True)
    status = fields.CharEnumField(AgentApprovalStatusV1, max_length=16, db_index=True)
    requested_at = fields.DatetimeField(db_index=True)
    expires_at = fields.DatetimeField(db_index=True)
    resolved_at = fields.DatetimeField(null=True, db_index=True)
    resolved_by_actor_id = fields.UUIDField(null=True, db_index=True)
    policy_version = fields.CharField(max_length=192)
    risk = fields.JSONField()
    options = fields.JSONField(default=list)
    selected_option_id = fields.CharField(max_length=192, null=True)
    resolution_reason = fields.CharField(max_length=1000, null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID | None
        thread_id: UUID
        run_id: UUID
        message_part_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_approvals"
        unique_together = (("run_id", "tool_call_id", "checkpoint_id"),)
        indexes = (("workspace_id", "owner_user_id", "status"),)
        abstract = False


class AgentToolResponseV1Record(BaseModel):
    workspace = fields.ForeignKeyField("models.Workspace", related_name="ai_tool_responses", on_delete=fields.CASCADE)
    project = fields.ForeignKeyField(
        "models.ProjectRecord", related_name="ai_tool_responses", on_delete=fields.CASCADE, null=True
    )
    thread = fields.ForeignKeyField(
        "models.AgentThreadV1Record", related_name="tool_responses", on_delete=fields.CASCADE
    )
    run = fields.ForeignKeyField("models.AgentRunV1Record", related_name="tool_responses", on_delete=fields.CASCADE)
    approval = fields.ForeignKeyField(
        "models.AgentApprovalV1Record", related_name="responses", on_delete=fields.CASCADE, null=True
    )
    actor_user_id = fields.UUIDField(db_index=True)
    response_id = fields.CharField(max_length=192, unique=True)
    kind = fields.CharEnumField(AgentToolResponseKindV1, max_length=16, db_index=True)
    tool_call_id = fields.CharField(max_length=192, db_index=True)
    checkpoint_id = fields.CharField(max_length=192, db_index=True)
    idempotency_key = fields.CharField(max_length=192)
    expected_sequence = fields.IntField()
    payload = fields.JSONField()
    consumed_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID | None
        thread_id: UUID
        run_id: UUID
        approval_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "ai_tool_responses"
        unique_together = (("run_id", "actor_user_id", "idempotency_key"),)
        indexes = (("run_id", "checkpoint_id", "kind"),)
        abstract = False
