from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class WorkspaceExtensionActivationStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class WorkspaceExtensionActivation(BaseModel):
    extension_name = fields.CharField(max_length=128, db_index=True)
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="extension_activations",
        on_delete=fields.CASCADE,
    )
    status = fields.CharEnumField(
        WorkspaceExtensionActivationStatus,
        default=WorkspaceExtensionActivationStatus.ACTIVE,
        db_index=True,
    )
    activated_at = fields.DatetimeField(null=True)
    deactivated_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_workspace_extension_activations"
        abstract = False
        unique_together = (("extension_name", "workspace_id"),)
