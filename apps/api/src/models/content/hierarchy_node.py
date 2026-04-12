from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class HierarchyNodeRecord(BaseModel):
    """Domain model for hierarchy node records."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_hierarchy_nodes",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_hierarchy_nodes",
        on_delete=fields.CASCADE,
    )
    item = fields.OneToOneField(
        "models.ContentItemRecord",
        related_name="hierarchy_node",
        on_delete=fields.CASCADE,
    )
    parent_item = fields.ForeignKeyField(
        "models.ContentItemRecord",
        related_name="child_hierarchy_nodes",
        null=True,
        on_delete=fields.SET_NULL,
    )

    sort_order = fields.IntField(default=0)

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID
        item_id: UUID
        parent_item_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "domain_content_hierarchy_nodes"
        abstract = False
