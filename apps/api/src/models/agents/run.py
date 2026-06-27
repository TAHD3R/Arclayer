from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.agents.types import AgentRunStatus
from src.common.models.base import BaseModel


class AgentRunRecord(BaseModel):
    """Persistent state snapshot for a project Agent run."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="agent_runs",
        on_delete=fields.CASCADE,
    )
    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="agent_runs",
        on_delete=fields.CASCADE,
    )

    user_id = fields.UUIDField(db_index=True)
    agent_id = fields.CharField(max_length=64, db_index=True)
    status = fields.CharEnumField(AgentRunStatus, max_length=16, db_index=True)
    prompt = fields.TextField()
    model = fields.CharField(max_length=128, null=True)
    result = fields.JSONField(null=True)
    tool_outputs = fields.JSONField(default=dict)
    events = fields.JSONField(default=list)
    cancellation_requested = fields.BooleanField(default=False, db_index=True)
    error_code = fields.CharField(max_length=64, null=True)
    error_message = fields.TextField(null=True)
    correlation_id = fields.CharField(max_length=128, db_index=True)
    runtime_id = fields.UUIDField(null=True, db_index=True)
    site_id = fields.UUIDField(null=True, db_index=True)
    environment_id = fields.UUIDField(null=True, db_index=True)
    langgraph_thread_id = fields.CharField(max_length=160, unique=True, db_index=True)
    langgraph_checkpoint_ns = fields.CharField(max_length=96, default="project-agent", db_index=True)
    langgraph_checkpoint_id = fields.CharField(max_length=192, null=True, db_index=True)
    langgraph_checkpoint_node = fields.CharField(max_length=96, null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID

    class Meta(BaseModel.Meta):
        table = "agent_runs"
        table_description = "Persistent project Agent run state snapshots."
        abstract = False
