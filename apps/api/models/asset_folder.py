from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from apps.api.models.base import BaseModel


class AssetFolderRecord(BaseModel):
    """
    Asset folder (org-scoped).

    Notes:
    - This is a logical organization layer for the asset library.
    - For SaaS, folder data stays tenant-scoped via org_id.
    """

    org_id = fields.UUIDField(db_index=True)
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
        unique_together = (("org_id", "parent_id", "name"),)
