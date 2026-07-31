from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class HostingCommercialAccessState(StrEnum):
    SERVING = "serving"
    CONTINUITY_REQUIRED = "continuity_required"
    SUSPENDED = "suspended"
    RESTORATION_REQUIRED = "restoration_required"
    RESTORED = "restored"


class HostingCommercialAccessProjection(BaseModel):
    """Hosting-owned continuity and restoration state; Commerce never writes release state."""

    workspace_id = fields.UUIDField(unique=True)
    state = fields.CharEnumField(HostingCommercialAccessState, default=HostingCommercialAccessState.SERVING)
    preserved_release_id = fields.UUIDField(null=True)
    source_identity = fields.CharField(max_length=255, unique=True)

    class Meta(BaseModel.Meta):
        table = "hosting_commercial_access_projections"
        table_description = "Hosting-owned response to Commerce commercial access facts."
        abstract = False
        indexes = (("state", "updated_at"),)


class HostingCommercialAccessReceipt(BaseModel):
    """At-least-once consumer receipt for one committed Commerce Hosting handoff."""

    source_identity = fields.CharField(max_length=255, unique=True)
    workspace_id = fields.UUIDField(db_index=True)
    resulting_state = fields.CharEnumField(HostingCommercialAccessState)

    class Meta(BaseModel.Meta):
        table = "hosting_commercial_access_receipts"
        table_description = "Idempotent Hosting consumption receipts for Commerce handoffs."
        abstract = False
