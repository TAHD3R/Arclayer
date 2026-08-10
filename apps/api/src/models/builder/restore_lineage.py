from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class BuilderRestoreLineageRecord(BaseModel):
    """Explicit source/target pair for a durable Builder restore revision."""

    project_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(db_index=True)
    restore_revision_id = fields.UUIDField(unique=True, db_index=True)
    source_revision_id = fields.UUIDField(db_index=True)
    target_revision_id = fields.UUIDField(db_index=True)

    class Meta(BaseModel.Meta):
        table = "builder_restore_lineages"
        table_description = "Explicit Builder restore source and target revision pairs."
        abstract = False
        unique_together = (("project_id", "restore_revision_id"),)

    if TYPE_CHECKING:
        id: UUID


__all__ = ["BuilderRestoreLineageRecord"]
