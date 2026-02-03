from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from apps.api.common.models.base import BaseModel


class AssetFolderRecord(BaseModel):
    """
    Asset folder (workspace-scoped in v2).

    Notes:
    - This is a logical organization layer for the asset library.
    - v2: asset library is part of workspace governance, so all folder data is scoped by workspace_id.
    """

    workspace_id = fields.UUIDField(db_index=True)
    parent = fields.ForeignKeyField(
        "models.AssetFolderRecord",
        related_name="children",
        null=True,
        on_delete=fields.SET_NULL,
    )
    name = fields.CharField(max_length=64)
    description = fields.CharField(max_length=512, null=True)
    sort_order = fields.IntField(default=0)

    if TYPE_CHECKING:
        parent_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "asset_folders"
        abstract = False
        unique_together = (("workspace_id", "parent_id", "name"),)
