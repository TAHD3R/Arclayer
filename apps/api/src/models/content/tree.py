from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class ContentTreeNodeRecord(BaseModel):
    """Tree hierarchy metadata for a content entry (capability: treeable)."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_tree_nodes",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_tree_nodes",
        on_delete=fields.CASCADE,
    )
    entry = fields.OneToOneField(
        "models.ContentEntryRecord",
        related_name="tree_node",
        on_delete=fields.CASCADE,
    )

    parent_entry = fields.ForeignKeyField(
        "models.ContentEntryRecord",
        related_name="tree_children",
        null=True,
        on_delete=fields.SET_NULL,
    )
    sort_order = fields.IntField(default=0)

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID
        entry_id: UUID
        parent_entry_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "content_tree_nodes"
        abstract = False
        unique_together = (("site_id", "entry_id"),)
