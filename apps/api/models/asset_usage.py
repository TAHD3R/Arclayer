from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class AssetUsageRecord(BaseModel):
    """
    Asset usage reference (org-scoped).

    用途：
    - 记录“某个资源被哪个业务实体的哪个字段引用”，用于：
      - 资源详情页展示 Where used（被引用位置）
      - 删除/回收站操作前的影响提示
      - 后续做“未使用资源”清理、审计与治理策略（purpose/indexable presets）

    设计原则：
    - entity_type 使用字符串约定，支持插件扩展（例如 `core.settings`、`plugin.xxx`）。
    - field_key 建议用点路径（例如 `site.logo`、`seo.og_image`）。
    """

    org_id = fields.UUIDField(db_index=True)

    asset = fields.ForeignKeyField(
        "models.AssetRecord",
        related_name="usages",
        on_delete=fields.CASCADE,
    )

    # Usage-level purpose: allow arbitrary strings so it can evolve without DB enum changes.
    purpose = fields.CharField(max_length=64, db_index=True)

    entity_type = fields.CharField(max_length=128, db_index=True)
    entity_id = fields.CharField(max_length=128, db_index=True)
    field_key = fields.CharField(max_length=128, db_index=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "asset_usages"
        abstract = False
        unique_together = (("org_id", "entity_type", "entity_id", "field_key"),)
