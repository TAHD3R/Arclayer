from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel
from src.models.design_systems._enums import DesignSystemOwnerKind


class AgentRunDesignSystemSnapshotV1Record(BaseModel):
    run = fields.OneToOneField(
        "models.AgentRunV1Record",
        related_name="design_system_snapshot",
        on_delete=fields.CASCADE,
    )
    project_id = fields.UUIDField(db_index=True)
    assignment_id = fields.UUIDField(db_index=True)
    assignment_revision = fields.IntField()
    design_system_id = fields.UUIDField(db_index=True)
    design_system_version_id = fields.UUIDField(db_index=True)
    owner_kind = fields.CharEnumField(DesignSystemOwnerKind, max_length=16)
    manifest_checksum = fields.CharField(max_length=71, db_index=True)
    validation_finding_hash = fields.CharField(max_length=71)
    token_index_hash = fields.CharField(max_length=71)
    context_hash = fields.CharField(max_length=71, db_index=True)
    context_snapshot = fields.JSONField()
    context_byte_size = fields.IntField()

    if TYPE_CHECKING:
        run_id: UUID

    class Meta(BaseModel.Meta):
        table = "ai_run_design_system_snapshots"
        table_description = "Exact immutable Design System context captured for project-scoped Agent Runs."
        abstract = False
        indexes = (
            ("project_id", "created_at"),
            ("design_system_version_id", "created_at"),
        )
