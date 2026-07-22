from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class AgentChangeSetV1Record(BaseModel):
    workspace = fields.ForeignKeyField("models.Workspace", related_name="ai_change_sets", on_delete=fields.CASCADE)
    project = fields.ForeignKeyField(
        "models.ProjectRecord", related_name="ai_change_sets", on_delete=fields.CASCADE, null=True
    )
    thread = fields.ForeignKeyField("models.AgentThreadV1Record", related_name="change_sets", on_delete=fields.CASCADE)
    run = fields.ForeignKeyField("models.AgentRunV1Record", related_name="change_sets", on_delete=fields.CASCADE)
    change_set_id = fields.CharField(max_length=192, unique=True)
    base_revision_id = fields.CharField(max_length=192)
    preview_ref = fields.CharField(max_length=512)
    summary_key = fields.CharField(max_length=256)
    summary_params = fields.JSONField(default=dict)
    warnings = fields.JSONField(default=list)
    required_approval_ids = fields.JSONField(default=list)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID | None
        thread_id: UUID
        run_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_change_sets"
        indexes = (("run_id", "created_at"),)
        abstract = False
