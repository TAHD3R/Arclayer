from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


# Asset folder record (scoped: project/org/user).
class AssetFolderRecord(BaseModel):
    """Domain model for asset folder records.

    Asset folder (scoped in v3).

    Notes:
    - This is a logical organization layer for the asset library.
    - v2: asset library was workspace-scoped.
    - v3: asset library supports workspace/org/user scopes.
    """

    # Exactly one scope id must be set (enforced at service boundary).
    workspace_id = fields.UUIDField(null=True, db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    organization_id = fields.UUIDField(null=True, db_index=True)
    user_id = fields.UUIDField(null=True, db_index=True)
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
        table = "domain_asset_folders"
        abstract = False
        unique_together = (
            ("workspace_id", "parent_id", "name"),
            ("project_id", "parent_id", "name"),
            ("organization_id", "parent_id", "name"),
            ("user_id", "parent_id", "name"),
        )
