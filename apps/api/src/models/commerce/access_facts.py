from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class CommercialAccessFactKind(StrEnum):
    LIFECYCLE_NOTIFICATION = "lifecycle_notification"
    HOSTING_HANDOFF = "hosting_handoff"


class CommercialAccessFact(BaseModel):
    """Immutable Commerce fact made available to independent domain consumers."""

    workspace_id = fields.UUIDField(db_index=True)
    kind = fields.CharEnumField(CommercialAccessFactKind, db_index=True)
    source_identity = fields.CharField(max_length=255)
    payload = fields.JSONField()
    effective_at = fields.DatetimeField(db_index=True)

    class Meta(BaseModel.Meta):
        table = "commerce_commercial_access_facts"
        table_description = "Committed Commerce facts for Hosting and lifecycle notification consumers."
        abstract = False
        unique_together = (("kind", "source_identity"),)
        indexes = (("workspace_id", "kind", "created_at"),)
