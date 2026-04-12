from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class AppStatus(StrEnum):
    INSTALLED = "installed"
    DISABLED = "disabled"
    FAILED = "failed"


class ExtensionApp(BaseModel):
    """
    Installed app record (official/community).

    Notes:
    - Stores a snapshot of the provider manifest for capability resolution.
    - Does NOT execute provider code in-process.
    """

    app_id = fields.CharField(max_length=128, unique=True, db_index=True)
    provider = fields.CharField(max_length=32, default="community")
    status = fields.CharEnumField(AppStatus, default=AppStatus.INSTALLED, db_index=True)

    name = fields.CharField(max_length=200)
    description = fields.TextField(null=True)
    version = fields.CharField(max_length=64, null=True)

    # Provider-facing manifest snapshot (validated before persistence).
    manifest = fields.JSONField(null=True)

    # Optional endpoints used by runtime (remote hooks / embeds / webhooks).
    base_url = fields.CharField(max_length=512, null=True)

    class Meta(BaseModel.Meta):
        table = "extension_apps"
        abstract = False
