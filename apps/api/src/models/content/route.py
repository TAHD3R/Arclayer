from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class ContentRouteRecord(BaseModel):
    """Routable path binding for a content entry (capability: routable)."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_routes",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_routes",
        on_delete=fields.CASCADE,
    )
    entry = fields.ForeignKeyField(
        "models.ContentEntryRecord",
        related_name="routes",
        on_delete=fields.CASCADE,
    )

    locale = fields.CharField(max_length=16, default="zh-CN", db_index=True)
    path = fields.CharField(max_length=512, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID
        entry_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_routes"
        abstract = False
        unique_together = (
            ("site_id", "locale", "path"),
            ("entry_id", "locale"),
        )
