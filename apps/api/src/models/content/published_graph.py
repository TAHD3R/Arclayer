from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class PublishedGraphRecord(BaseModel):
    """Domain model for published graph records."""

    release = fields.ForeignKeyField(
        "models.ContentReleaseRecord",
        related_name="graph_nodes",
        on_delete=fields.CASCADE,
    )
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_published_graphs",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_published_graphs",
        on_delete=fields.CASCADE,
    )
    item = fields.ForeignKeyField(
        "models.ContentItemRecord",
        related_name="published_graph_nodes",
        on_delete=fields.CASCADE,
    )
    version = fields.ForeignKeyField(
        "models.ContentVersionRecord",
        related_name="published_graph_nodes",
        on_delete=fields.CASCADE,
    )

    locale = fields.CharField(max_length=16, default="zh-CN", db_index=True)
    route_path = fields.CharField(max_length=512, db_index=True)
    route_contract = fields.JSONField(null=True)
    hierarchy_parent_item = fields.ForeignKeyField(
        "models.ContentItemRecord",
        related_name="published_graph_children",
        null=True,
        on_delete=fields.SET_NULL,
    )
    hierarchy_sort_order = fields.IntField(default=0)

    if TYPE_CHECKING:
        release_id: UUID
        workspace_id: UUID
        site_id: UUID
        item_id: UUID
        version_id: UUID
        hierarchy_parent_item_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "content_published_graph"
        table_description = "Published content graph records for live site delivery."
        abstract = False
        unique_together = (("release_id", "site_id", "locale", "route_path"), ("release_id", "item_id", "locale"))
