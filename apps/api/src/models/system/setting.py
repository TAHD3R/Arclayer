from __future__ import annotations

from tortoise import fields

from src.common.models.base import BaseModel
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


# Settings store (scope + namespace -> value).
class SettingRecord(BaseModel):
    """Runtime settings store (scoped namespace -> JSON value)."""

    scope_type = fields.CharField(max_length=16, default=SCOPE_TYPE_SYSTEM, db_index=True)
    scope_id = fields.UUIDField(db_index=True, default=SYSTEM_SCOPE_ID)
    namespace = fields.CharField(max_length=128, db_index=True)
    value = fields.JSONField(null=True)
    updated_by = fields.UUIDField(null=True)

    class Meta(BaseModel.Meta):
        table = "settings"
        abstract = False
        unique_together = (("scope_type", "scope_id", "namespace"),)
