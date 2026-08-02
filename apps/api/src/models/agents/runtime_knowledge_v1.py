from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class AgentRunKnowledgeSnapshotV1Record(BaseModel):
    run = fields.OneToOneField(
        "models.AgentRunV1Record",
        related_name="knowledge_snapshot",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    workspace_revision_id = fields.UUIDField(null=True, db_index=True)
    project_revision_id = fields.UUIDField(null=True, db_index=True)
    context_hash = fields.CharField(max_length=71, db_index=True)
    context_snapshot = fields.JSONField()
    context_byte_size = fields.IntField()
    source_snapshot_count = fields.IntField()

    if TYPE_CHECKING:
        run_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_run_knowledge_snapshots"
        table_description = "Exact immutable Knowledge guidance captured when an Agent Run is created."
        abstract = False
        indexes = (
            ("workspace_id", "created_at"),
            ("project_id", "created_at"),
            ("workspace_revision_id", "created_at"),
            ("project_revision_id", "created_at"),
        )


class AgentRunKnowledgeSourceSnapshotV1Record(BaseModel):
    run = fields.ForeignKeyField(
        "models.AgentRunV1Record",
        related_name="knowledge_source_snapshots",
        on_delete=fields.CASCADE,
    )
    source_order = fields.IntField()
    knowledge_base_id = fields.UUIDField(db_index=True)
    policy_revision = fields.IntField()
    source_id = fields.UUIDField(db_index=True)
    source_version_id = fields.UUIDField(db_index=True)
    source_name = fields.CharField(max_length=160)
    source_version_content_hash = fields.CharField(max_length=71)

    if TYPE_CHECKING:
        run_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_run_knowledge_source_snapshots"
        table_description = "Exact immutable Knowledge source versions pinned to an Agent Run."
        abstract = False
        unique_together = (("run_id", "source_id"),)
        indexes = (
            ("run_id", "source_order"),
            ("knowledge_base_id", "created_at"),
            ("source_version_id", "created_at"),
        )
