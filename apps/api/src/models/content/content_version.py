from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.content._enums import ContentVersionState


class ContentVersionRecord(BaseModel):
    """Domain model for content version records."""

    item = fields.ForeignKeyField(
        "models.ContentItemRecord",
        related_name="versions",
        on_delete=fields.CASCADE,
    )

    version = fields.IntField()
    state = fields.CharEnumField(
        ContentVersionState,
        max_length=16,
        default=ContentVersionState.DRAFT,
        db_index=True,
    )
    fields_snapshot = fields.JSONField(null=True)
    change_summary = fields.CharField(max_length=512, null=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    last_transition_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        item_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_content_versions"
        abstract = False
        unique_together = (("item_id", "version"),)
