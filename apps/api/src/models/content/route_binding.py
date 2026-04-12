from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class RouteBindingRecord(BaseModel):
    """Route record separated from mutable content item payload."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_route_bindings",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_route_bindings",
        on_delete=fields.CASCADE,
    )
    item = fields.ForeignKeyField(
        "models.ContentItemRecord",
        related_name="route_bindings",
        on_delete=fields.CASCADE,
    )

    locale = fields.CharField(max_length=16, default="zh-CN", db_index=True)
    path = fields.CharField(max_length=512, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID
        item_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_route_bindings"
        abstract = False
        unique_together = (("site_id", "locale", "path"), ("item_id", "locale"))
