from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.indexes import Index

from src.common.models import BaseModel


class ContentItemDeletionRecord(BaseModel):
    """Retained aggregate snapshot captured immediately before hard deletion."""

    workspace_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(null=True, db_index=True)
    item_id = fields.UUIDField(db_index=True)
    deletion_sequence = fields.IntField()
    snapshot = fields.JSONField()
    deleted_by_user_id = fields.UUIDField(null=True, db_index=True)
    deleted_at = fields.DatetimeField(db_index=True)
    restored_at = fields.DatetimeField(null=True, db_index=True)
    restored_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "content_item_deletion_records"
        table_description = "Retained ContentItem aggregate snapshots for explicit restore operations."
        abstract = False
        unique_together = (("item_id", "deletion_sequence"),)
        indexes = (
            Index(fields=("workspace_id", "site_id", "environment_id", "item_id", "restored_at")),
            Index(fields=("workspace_id", "deleted_at")),
        )

    if TYPE_CHECKING:
        id: UUID
