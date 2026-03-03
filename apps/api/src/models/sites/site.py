from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


# Site (public portal boundary).
class SiteRecord(BaseModel):
    """
    Site (public portal boundary).

    Sprint 3:
    - A site belongs to a workspace (tenant boundary).
    - Single-site workspace model: 1 workspace -> 1 site.
    - Public routing is resolved by `Workspace.slug` (workspaceSlug) instead of a site-level host field.
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

    is_active = fields.BooleanField(default=True, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "sites"
        abstract = False
        # Enforce 1:1 between workspace and site (single-site workspace model).
        # Slug is kept for forward compatibility, but is not part of the uniqueness contract.
        unique_together = (("workspace_id",),)
