from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class AgentConversationMode(StrEnum):
    BUILD = "build"
    PLAN = "plan"
    AGENT = "agent"


class AgentConversationRecord(BaseModel):
    """Persistent workspace AI conversation owned by a single user."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="agent_conversations",
        on_delete=fields.CASCADE,
    )
    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="agent_conversations",
        on_delete=fields.CASCADE,
        null=True,
    )

    user_id = fields.UUIDField(db_index=True)
    title = fields.CharField(max_length=160)
    mode = fields.CharEnumField(AgentConversationMode, max_length=16, db_index=True)
    model = fields.CharField(max_length=128, null=True)
    reasoning_effort = fields.CharField(max_length=16, null=True)
    messages = fields.JSONField(default=list)
    context_snapshot = fields.JSONField(default=dict)
    runtime_id = fields.UUIDField(null=True, db_index=True)
    site_id = fields.UUIDField(null=True, db_index=True)
    environment_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "agent_conversations"
        table_description = "Persistent workspace AI conversations and page context snapshots."
        abstract = False
