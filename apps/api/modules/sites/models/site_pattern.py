from __future__ import annotations

from tortoise import fields

from apps.api.common.models.base import BaseModel


class SitePattern(BaseModel):
    """User-defined block pattern (reusable block composition)."""

    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="patterns",
        on_delete=fields.CASCADE,
    )
    code = fields.CharField(max_length=128, db_index=True)
    label_json = fields.JSONField(default=dict)
    category = fields.CharField(max_length=64, default="custom")
    preview_image_url = fields.CharField(max_length=512, null=True)
    blocks_json = fields.JSONField(default=list)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "site_patterns"
        unique_together = (("site_id", "code"),)
