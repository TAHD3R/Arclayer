from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.indexes import Index

from src.common.models import BaseModel
from src.models.builder._enums import BuilderProvenanceSource


class BuilderDraftCheckpointRecord(BaseModel):
    """Mutable, durable Builder draft separate from immutable Site Revisions."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(db_index=True)
    actor_user_id = fields.UUIDField(db_index=True)
    client_session_id = fields.CharField(max_length=128)
    base_revision_id = fields.UUIDField(db_index=True)
    base_etag = fields.CharField(max_length=71)
    checkpoint_version = fields.IntField()
    operations = fields.JSONField()
    operations_hash = fields.CharField(max_length=71)
    status = fields.CharField(max_length=16, default="draft", db_index=True)
    provenance_source = fields.CharEnumField(BuilderProvenanceSource, max_length=16)
    agent_run_id = fields.UUIDField(null=True, db_index=True)
    agent_id = fields.UUIDField(null=True, db_index=True)
    last_idempotency_key = fields.CharField(max_length=128, null=True)
    last_request_fingerprint = fields.CharField(max_length=64, null=True)
    conflict_meta = fields.JSONField(null=True)
    applied_change_set_id = fields.UUIDField(null=True, db_index=True)
    discarded_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "builder_draft_checkpoints"
        table_description = "Durable Builder draft checkpoints separate from immutable revision history."
        abstract = False
        unique_together = (("project_id", "site_id", "environment_id", "actor_user_id", "client_session_id"),)
        indexes = (
            Index(fields=("project_id", "actor_user_id", "status", "updated_at")),
            Index(fields=("workspace_id", "project_id", "base_revision_id")),
        )

    if TYPE_CHECKING:
        id: UUID
