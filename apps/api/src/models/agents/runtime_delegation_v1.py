from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class AgentDelegationStatusV1(StrEnum):
    DELEGATED = "delegated"
    COMPLETED = "completed"
    FAILED = "failed"


class AgentDelegationV1Record(BaseModel):
    workspace = fields.ForeignKeyField("models.Workspace", related_name="ai_delegations", on_delete=fields.CASCADE)
    project = fields.ForeignKeyField(
        "models.ProjectRecord", related_name="ai_delegations", on_delete=fields.CASCADE, null=True
    )
    thread = fields.ForeignKeyField("models.AgentThreadV1Record", related_name="delegations", on_delete=fields.CASCADE)
    parent_run = fields.ForeignKeyField(
        "models.AgentRunV1Record", related_name="child_delegations", on_delete=fields.CASCADE
    )
    child_run = fields.ForeignKeyField(
        "models.AgentRunV1Record", related_name="parent_delegations", on_delete=fields.CASCADE
    )
    parent_message_part = fields.ForeignKeyField(
        "models.AgentMessagePartV1Record", related_name="delegations", on_delete=fields.CASCADE
    )
    owner_user_id = fields.UUIDField(db_index=True)
    delegation_id = fields.CharField(max_length=192, unique=True)
    parent_tool_call_id = fields.CharField(max_length=192, db_index=True)
    source_agent_version_id = fields.CharField(max_length=192)
    target_agent_version_id = fields.CharField(max_length=192)
    status = fields.CharEnumField(AgentDelegationStatusV1, max_length=16, db_index=True)
    delegated_at = fields.DatetimeField(db_index=True)
    completed_at = fields.DatetimeField(null=True, db_index=True)
    failed_at = fields.DatetimeField(null=True, db_index=True)
    objective_summary = fields.TextField()
    summary = fields.TextField(null=True)
    artifact_refs = fields.JSONField(default=list)
    error = fields.JSONField(null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID | None
        thread_id: UUID
        parent_run_id: UUID
        child_run_id: UUID
        parent_message_part_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_delegations"
        unique_together = (("parent_run_id", "parent_tool_call_id"), ("child_run_id",))
        indexes = (("workspace_id", "owner_user_id", "status"),)
        abstract = False
