from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class ContentReleaseRecord(BaseModel):
    """Domain model for content release records."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_releases",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_releases",
        on_delete=fields.CASCADE,
    )

    release_number = fields.IntField()
    is_active = fields.BooleanField(default=True, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    activated_at = fields.DatetimeField(auto_now_add=True, db_index=True)
    lineage_parent_release_id = fields.UUIDField(null=True, db_index=True)
    selection_count = fields.IntField(default=0)

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_content_releases"
        abstract = False
        unique_together = (("site_id", "release_number"),)
