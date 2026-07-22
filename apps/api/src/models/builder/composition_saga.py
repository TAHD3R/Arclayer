from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.indexes import Index

from src.common.models.base import BaseModel
from src.models.builder._enums import BuilderCompositionSagaStatus


class BuilderCompositionSagaRecord(BaseModel):
    """Tenant-owned planning-to-composition parent and immutable revision chain."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    runtime_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(db_index=True)
    actor_user_id = fields.UUIDField(db_index=True)
    initial_site_revision_id = fields.UUIDField(db_index=True)
    initial_manifest_hash = fields.CharField(max_length=71, db_index=True)
    initial_etag = fields.CharField(max_length=71)
    agent_run_id = fields.UUIDField(null=True, db_index=True)
    agent_id = fields.UUIDField(db_index=True)
    agent_version_id = fields.UUIDField(db_index=True)
    agent_assignment_id = fields.UUIDField(db_index=True)
    objective = fields.TextField()
    locale = fields.CharField(max_length=16)
    candidate_count = fields.IntField()
    targets = fields.JSONField()
    planning_targets = fields.JSONField()
    knowledge_reference_ids = fields.JSONField(default=list)
    request_fingerprint = fields.CharField(max_length=64)
    status = fields.CharEnumField(
        BuilderCompositionSagaStatus,
        max_length=32,
        default=BuilderCompositionSagaStatus.PLANNING_QUEUED,
        db_default=BuilderCompositionSagaStatus.PLANNING_QUEUED,
        db_index=True,
    )
    waiting_reason = fields.CharField(max_length=64, null=True)
    planning_generation_id = fields.UUIDField(db_index=True)
    planning_change_set_id = fields.UUIDField(null=True, db_index=True)
    planning_result_revision_id = fields.UUIDField(null=True, db_index=True)
    composition_generation_id = fields.UUIDField(null=True, db_index=True)
    composition_change_set_id = fields.UUIDField(null=True, db_index=True)
    composition_result_revision_id = fields.UUIDField(null=True, db_index=True)
    terminal_error = fields.JSONField(null=True)
    cancel_requested_at = fields.DatetimeField(null=True)
    cancel_requested_by_user_id = fields.UUIDField(null=True)
    cancel_reason = fields.TextField(null=True)
    terminal_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "builder_composition_sagas"
        table_description = "Durable planning-to-composition parent with two explicit review gates."
        abstract = False
        indexes = (
            Index(fields=("project_id", "actor_user_id", "status", "created_at")),
            Index(fields=("project_id", "initial_site_revision_id", "created_at")),
        )

    if TYPE_CHECKING:
        id: UUID
