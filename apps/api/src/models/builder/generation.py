from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.indexes import Index

from src.common.models.base import BaseModel
from src.models.builder._enums import BuilderGenerationStatus


class BuilderGenerationRecord(BaseModel):
    """Tenant-owned generation intent and candidate projection for one durable Job."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    runtime_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(db_index=True)
    base_site_revision_id = fields.UUIDField(db_index=True)
    base_manifest_hash = fields.CharField(max_length=71, db_index=True)
    base_etag = fields.CharField(max_length=71)
    job_id = fields.UUIDField(unique=True, db_index=True)
    actor_user_id = fields.UUIDField(db_index=True)
    agent_run_id = fields.UUIDField(null=True, db_index=True)
    agent_id = fields.UUIDField(null=True, db_index=True)
    agent_version_id = fields.UUIDField(null=True, db_index=True)
    agent_assignment_id = fields.UUIDField(null=True, db_index=True)
    tool_name = fields.CharField(max_length=128)
    target_stage = fields.CharField(max_length=32)
    objective = fields.TextField()
    locale = fields.CharField(max_length=16)
    candidate_count = fields.IntField()
    targets = fields.JSONField(default=list)
    knowledge_reference_ids = fields.JSONField(default=list)
    builder_context = fields.JSONField(null=True)
    planning_context = fields.JSONField(null=True)
    composition_context = fields.JSONField(null=True)
    design_context = fields.JSONField(null=True)
    composition_saga_id = fields.UUIDField(null=True, db_index=True)
    composition_saga_phase = fields.CharField(max_length=16, null=True)
    request_fingerprint = fields.CharField(max_length=64)
    status = fields.CharEnumField(
        BuilderGenerationStatus,
        max_length=16,
        default=BuilderGenerationStatus.QUEUED,
        db_default=BuilderGenerationStatus.QUEUED,
        db_index=True,
    )
    candidates = fields.JSONField(default=list)
    failures = fields.JSONField(default=list)
    started_at = fields.DatetimeField(null=True)
    terminal_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "builder_generations"
        table_description = "Durable Builder generation intent, partial candidates, and structured failures."
        abstract = False
        indexes = (
            Index(fields=("project_id", "site_id", "environment_id", "created_at")),
            Index(fields=("base_site_revision_id", "status", "created_at")),
        )

    if TYPE_CHECKING:
        id: UUID
