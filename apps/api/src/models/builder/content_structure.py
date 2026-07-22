from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.indexes import Index

from src.common.models.base import BaseModel
from src.models.builder._enums import BuilderProvenanceSource


class ContentStructureRevisionRecord(BaseModel):
    """Immutable sitemap input snapshot for one site and environment."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(db_index=True)
    revision_number = fields.IntField()
    parent_revision_id = fields.UUIDField(null=True, db_index=True)
    schema_version = fields.IntField(default=1)
    structure_hash = fields.CharField(max_length=71, db_index=True)
    structure_snapshot = fields.JSONField()
    provenance_source = fields.CharEnumField(BuilderProvenanceSource, max_length=16)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    agent_run_id = fields.UUIDField(null=True, db_index=True)
    agent_id = fields.UUIDField(null=True, db_index=True)
    agent_version_id = fields.UUIDField(null=True, db_index=True)
    agent_assignment_id = fields.UUIDField(null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "content_structure_revisions"
        table_description = "Immutable Builder sitemap snapshots over canonical content routing and hierarchy."
        abstract = False
        unique_together = (("project_id", "site_id", "environment_id", "revision_number"),)
        indexes = (Index(fields=("project_id", "site_id", "environment_id", "created_at")),)

    if TYPE_CHECKING:
        id: UUID
