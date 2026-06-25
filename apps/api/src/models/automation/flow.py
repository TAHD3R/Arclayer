from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class AutomationFlowStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class AutomationTriggerKind(StrEnum):
    PUBLISH_COMPLETED = "publish_completed"
    CONTENT_CREATED = "content_created"
    CONTENT_TRANSITIONED = "content_transitioned"
    API_KEY_ROTATED = "api_key_rotated"
    PREVIEW_TOKEN_CREATED = "preview_token_created"


class AutomationOperationKind(StrEnum):
    WEBHOOK = "webhook"
    HTTP_REQUEST = "http_request"
    AGENT_ANALYSIS = "agent_analysis"
    CONTENT_READ = "content_read"
    CONTENT_UPDATE = "content_update"
    RELEASE_PUBLISH = "release_publish"
    NOTIFICATION = "notification"


class AutomationRunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


class AutomationRunLogLevel(StrEnum):
    INFO = "info"
    ERROR = "error"


class AutomationFlow(BaseModel):
    """Workspace-scoped automation flow definition."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="automation_flows",
        on_delete=fields.CASCADE,
    )

    name = fields.CharField(max_length=128)
    description = fields.CharField(max_length=512, null=True)
    status = fields.CharEnumField(AutomationFlowStatus, max_length=16, default=AutomationFlowStatus.ACTIVE)
    trigger_kind = fields.CharEnumField(AutomationTriggerKind, max_length=32, db_index=True)
    trigger_event = fields.CharField(max_length=128, db_index=True)
    retry_limit = fields.IntField(default=0)
    dead_letter_enabled = fields.BooleanField(default=True)
    credential_binding = fields.JSONField(null=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "automation_flows"
        table_description = "Workspace-scoped automation flow definitions."
        abstract = False
        unique_together = (("workspace_id", "name"),)


class AutomationOperation(BaseModel):
    """Ordered operation inside an automation flow."""

    flow = fields.ForeignKeyField(
        "models.AutomationFlow",
        related_name="operations",
        on_delete=fields.CASCADE,
    )

    name = fields.CharField(max_length=128)
    kind = fields.CharEnumField(AutomationOperationKind, max_length=32, db_index=True)
    config = fields.JSONField(null=True)
    sort_order = fields.IntField(default=0)

    if TYPE_CHECKING:
        flow_id: UUID

    class Meta(BaseModel.Meta):
        table = "automation_operations"
        table_description = "Ordered operation steps within an automation flow."
        abstract = False


class AutomationRun(BaseModel):
    """Execution record for one triggered flow run."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="automation_runs",
        on_delete=fields.CASCADE,
    )
    flow = fields.ForeignKeyField(
        "models.AutomationFlow",
        related_name="runs",
        on_delete=fields.CASCADE,
    )

    trigger_event = fields.CharField(max_length=128, db_index=True)
    status = fields.CharEnumField(AutomationRunStatus, max_length=16, db_index=True)
    attempt = fields.IntField(default=1)
    max_attempts = fields.IntField(default=1)
    event_payload = fields.JSONField(null=True)
    result_payload = fields.JSONField(null=True)
    error = fields.CharField(max_length=512, null=True)
    started_at = fields.DatetimeField(null=True, db_index=True)
    completed_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        flow_id: UUID

    class Meta(BaseModel.Meta):
        table = "automation_runs"
        table_description = "Execution records for triggered automation flow runs."
        abstract = False


class AutomationRunLog(BaseModel):
    """Structured execution log row for automation run diagnostics."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="automation_run_logs",
        on_delete=fields.CASCADE,
    )
    run = fields.ForeignKeyField(
        "models.AutomationRun",
        related_name="logs",
        on_delete=fields.CASCADE,
    )
    operation = fields.ForeignKeyField(
        "models.AutomationOperation",
        related_name="run_logs",
        null=True,
        on_delete=fields.SET_NULL,
    )

    level = fields.CharEnumField(AutomationRunLogLevel, max_length=16, db_index=True)
    message = fields.CharField(max_length=512)
    payload = fields.JSONField(null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        run_id: UUID
        operation_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "automation_run_logs"
        table_description = "Structured log entries for automation run diagnostics."
        abstract = False
