from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class WorkspaceOwnershipTransfer(BaseModel):
    """Immutable receipt for one completed Workspace ownership transfer."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="ownership_transfers",
        on_delete=fields.CASCADE,
    )
    previous_owner_user_id = fields.UUIDField(db_index=True)
    next_owner_user_id = fields.UUIDField(db_index=True)
    initiated_by_user_id = fields.UUIDField(db_index=True)
    idempotency_key = fields.CharField(max_length=128)
    correlation_id = fields.UUIDField(unique=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "workspace_ownership_transfers"
        table_description = "Immutable idempotency and audit receipts for Workspace ownership transfer."
        abstract = False
        unique_together = (("workspace_id", "idempotency_key"),)
        indexes = (("workspace_id", "created_at"),)
