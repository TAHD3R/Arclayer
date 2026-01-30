from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class SettingRecord(BaseModel):
    """Runtime settings store (namespace -> JSON value)."""

    namespace = fields.CharField(max_length=128, unique=True, db_index=True)
    value = fields.JSONField(null=True)
    updated_by = fields.UUIDField(null=True)

    class Meta(BaseModel.Meta):
        table = "settings"
        abstract = False
