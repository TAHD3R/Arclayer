from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from tortoise import fields

from apps.api.models.base import BaseModel
from apps.api.plugin.types import PluginStatus


class PluginRecord(BaseModel):
    """Installed plugin record (manifest snapshot + runtime config)."""

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
    package_filename = fields.CharField(max_length=255, null=True)
    package_checksum = fields.CharField(max_length=128, null=True)
    package_size = fields.BigIntField(null=True)
    permissions = fields.JSONField(null=True)
    config_schema = fields.JSONField(null=True)
    config = fields.JSONField(null=True)

    if TYPE_CHECKING:
        plugin_id: str
        name: str
        description: str | None
        author: str
        version: str
        requires: str
        entrypoint: str
        website: str | None
        repository: str | None
        issues: str | None
        license: str | None
        status: PluginStatus
        storage_path: str
        started_at: datetime | None
        package_filename: str | None
        package_checksum: str | None
        package_size: int | None
        permissions: list[dict[str, Any]] | None
        config_schema: dict[str, Any] | None
        config: dict[str, Any] | None

    class Meta(BaseModel.Meta):
        table = "plugins"
        abstract = False
