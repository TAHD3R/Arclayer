from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class AgentApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    APPLIED = "applied"


class AgentApprovalTargetType(StrEnum):
    CONTENT_ITEM = "content_item"
    CONTENT_MODEL = "content_model"


class AgentApprovalRecord(BaseModel):
    """Durable approval checkpoint for proposed Agent write actions."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="agent_approvals",
        on_delete=fields.CASCADE,
    )
    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="agent_approvals",
        on_delete=fields.CASCADE,
    )
    agent_run = fields.ForeignKeyField(
        "models.AgentRunRecord",
        related_name="approvals",
        on_delete=fields.SET_NULL,
        null=True,
    )

    requester_user_id = fields.UUIDField(db_index=True)
    approver_user_id = fields.UUIDField(null=True, db_index=True)
    skill_id = fields.CharField(max_length=96, db_index=True)
    tool_name = fields.CharField(max_length=128, null=True, db_index=True)
    action = fields.CharField(max_length=128, db_index=True)
    target_type = fields.CharEnumField(AgentApprovalTargetType, max_length=32, db_index=True)
    target_id = fields.UUIDField(null=True, db_index=True)
    expected_draft_version = fields.IntField(null=True)
    target_snapshot = fields.JSONField(default=dict)
    proposed_patch = fields.JSONField(default=dict)
    dry_run = fields.JSONField(default=dict)
    status = fields.CharEnumField(
        AgentApprovalStatus,
        max_length=16,
        default=AgentApprovalStatus.PENDING,
        db_index=True,
    )
    expires_at = fields.DatetimeField(db_index=True)
    approved_at = fields.DatetimeField(null=True)
    rejected_at = fields.DatetimeField(null=True)
    expired_at = fields.DatetimeField(null=True)
    applied_at = fields.DatetimeField(null=True)
    decision_reason = fields.CharField(max_length=512, null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID
        agent_run_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "agent_approvals"
        table_description = "Durable approval checkpoints for Agent proposed write actions."
        abstract = False
