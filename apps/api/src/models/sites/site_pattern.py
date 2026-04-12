from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Site pattern definition (reusable blocks composition).
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
    # 代码层统一语义为 PageBlueprintFragment；底层数据库列名仍为 blocks_json（历史原因）。
    page_blueprint_fragment_json = fields.JSONField(default=dict, source_field="blocks_json")
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "site_patterns"
        abstract = False
        unique_together = (("site_id", "code"),)
