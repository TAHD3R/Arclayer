from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class OrgChangeLog(BaseModel):
    """
    组织结构调整审计日志。

    注意：日志内容允许存 JSON，但必须避免写入敏感字段（如密码/Token）。
    """

    actor_user_id = fields.UUIDField(null=True, db_index=True)
    action = fields.CharField(max_length=64, db_index=True)
    entity_type = fields.CharField(max_length=64, null=True, db_index=True)
    entity_id = fields.UUIDField(null=True, db_index=True)
    payload = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "org_change_logs"
        abstract = False
