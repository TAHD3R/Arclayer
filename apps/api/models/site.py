from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class SiteRecord(BaseModel):
    """
    Site (public portal boundary).

    Sprint 3:
    - A site belongs to a workspace (tenant boundary).
    - Host mapping is simplified to a single `primary_host` string.
      Future: support multiple domains + verification workflow.
    """

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="sites",
        on_delete=fields.CASCADE,
    )

    slug = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)

    default_locale = fields.CharField(max_length=16, default="zh-CN")
    fallback_locale = fields.CharField(max_length=16, default="en-US")

    # Postgres allows multiple NULLs for UNIQUE; this keeps dev bootstrap flexible.
    primary_host = fields.CharField(max_length=255, null=True, unique=True)

    is_active = fields.BooleanField(default=True, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "sites"
        abstract = False
        unique_together = (("workspace_id", "slug"),)
