from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel
from apps.api.plugin.types import PluginStatus


class PluginRecord(BaseModel):
    plugin_id = fields.CharField(max_length=128, unique=True, db_index=True)
    name = fields.CharField(max_length=200)
    description = fields.TextField(null=True)
    author = fields.CharField(max_length=200)
    version = fields.CharField(max_length=64)
    requires = fields.CharField(max_length=64)
    entrypoint = fields.CharField(max_length=255)
    website = fields.CharField(max_length=255, null=True)
    repository = fields.CharField(max_length=255, null=True)
    issues = fields.CharField(max_length=255, null=True)
    license = fields.CharField(max_length=64, null=True)
    status = fields.CharEnumField(PluginStatus, default=PluginStatus.INSTALLED, db_index=True)
    storage_path = fields.CharField(max_length=512)
    started_at = fields.DatetimeField(null=True)
    permissions = fields.JSONField(null=True)
    config_schema = fields.JSONField(null=True)
    config = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "plugins"
        abstract = False
