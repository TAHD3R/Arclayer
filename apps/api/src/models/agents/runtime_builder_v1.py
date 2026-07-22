from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class AgentRunBuilderSnapshotV1Record(BaseModel):
    """Exact immutable Builder aggregate context captured for one Agent Run."""

    run = fields.OneToOneField(
        "models.AgentRunV1Record",
        related_name="builder_snapshot",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(db_index=True)
    site_revision_id = fields.UUIDField(db_index=True)
    revision_number = fields.IntField()
    manifest_hash = fields.CharField(max_length=71, db_index=True)
    status_etag = fields.CharField(max_length=71)
    content_structure_revision_id = fields.UUIDField(db_index=True)
    content_structure_hash = fields.CharField(max_length=71, db_index=True)
    context_hash = fields.CharField(max_length=71, db_index=True)
    context_snapshot = fields.JSONField()
    context_byte_size = fields.IntField()

    if TYPE_CHECKING:
        run_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_run_builder_snapshots"
        table_description = "Exact immutable Site Revision context captured for Builder-bound Agent Runs."
        abstract = False
        indexes = (
            ("project_id", "site_revision_id", "created_at"),
            ("workspace_id", "created_at"),
        )
