from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.indexes import Index

from src.common.models.base import BaseModel
from src.models.design_systems._enums import DesignSystemConceptGenerationStatus


class DesignSystemConceptGenerationRecord(BaseModel):
    """Tenant-owned Style Guide concept intent and durable candidate projection."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    design_system_id = fields.UUIDField(db_index=True)
    base_version_id = fields.UUIDField(db_index=True)
    base_manifest_checksum = fields.CharField(max_length=71, db_index=True)
    base_site_revision_id = fields.UUIDField(db_index=True)
    base_etag = fields.CharField(max_length=71)
    job_id = fields.UUIDField(unique=True, db_index=True)
    actor_user_id = fields.UUIDField(db_index=True)
    agent_run_id = fields.UUIDField(null=True, db_index=True)
    agent_id = fields.UUIDField(null=True, db_index=True)
    agent_version_id = fields.UUIDField(null=True, db_index=True)
    agent_assignment_id = fields.UUIDField(null=True, db_index=True)
    design_system_context = fields.JSONField(null=True)
    builder_context = fields.JSONField(null=True)
    tool_name = fields.CharField(max_length=128)
    objective = fields.TextField()
    locale = fields.CharField(max_length=16)
    candidate_count = fields.IntField()
    request_fingerprint = fields.CharField(max_length=64)
    status = fields.CharEnumField(
        DesignSystemConceptGenerationStatus,
        max_length=16,
        default=DesignSystemConceptGenerationStatus.QUEUED,
        db_default=DesignSystemConceptGenerationStatus.QUEUED,
        db_index=True,
    )
    candidates = fields.JSONField(default=list)
    failures = fields.JSONField(default=list)
    started_at = fields.DatetimeField(null=True)
    terminal_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "design_system_concept_generations"
        table_description = "Durable Agent Style Guide concept intents, candidates, and structured failures."
        abstract = False
        indexes = (
            Index(fields=("project_id", "design_system_id", "created_at")),
            Index(fields=("base_version_id", "status", "created_at")),
        )

    if TYPE_CHECKING:
        id: UUID
