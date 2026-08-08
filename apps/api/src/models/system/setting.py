from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


# Settings store (scope + namespace -> value).
class SettingRecord(BaseModel):
    """Internal model for setting records."""

    scope_type = fields.CharField(max_length=16, default=SCOPE_TYPE_SYSTEM, db_index=True)
    scope_id = fields.UUIDField(db_index=True, default=SYSTEM_SCOPE_ID)
    namespace = fields.CharField(max_length=128, db_index=True)
    value = fields.JSONField(null=True)
    updated_by = fields.UUIDField(null=True)

    class Meta(BaseModel.Meta):
        table = "system_settings"
        table_description = "Key-value setting records scoped by type and namespace."
        abstract = False
        unique_together = (("scope_type", "scope_id", "namespace"),)


class PlatformSystemSettingsCommandReceipt(BaseModel):
    """Durable exact replay record for Platform System Settings writes."""

    section = fields.CharField(max_length=64)
    idempotency_key_hash = fields.CharField(max_length=64, unique=True)
    request_fingerprint = fields.CharField(max_length=64)
    actor_user_id = fields.UUIDField(db_index=True)
    result_revision = fields.BigIntField()
    result_snapshot = fields.JSONField()
    audit_event = fields.ForeignKeyField(
        "models.AuditEvent",
        related_name="platform_system_settings_command_receipts",
        on_delete=fields.RESTRICT,
    )

    if TYPE_CHECKING:
        audit_event_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_system_settings_command_receipts"
        table_description = "Exact idempotency and audit evidence for Platform System Settings writes."
        abstract = False
        indexes = (("section", "created_at"), ("actor_user_id", "created_at"))


class PlatformLanguageCatalogRevisionStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    RETIRED = "retired"


class PlatformLanguageCatalogRevision(BaseModel):
    """Versioned Platform-only language catalog; publish is the runtime boundary."""

    sequence = fields.IntField(unique=True, db_index=True)
    status = fields.CharEnumField(PlatformLanguageCatalogRevisionStatus, db_index=True)
    enabled_locales = fields.JSONField()
    default_locale = fields.CharField(max_length=16)
    impact_snapshot = fields.JSONField(null=True)
    actor_user_id = fields.UUIDField(db_index=True)
    published_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "platform_language_catalog_revisions"
        table_description = "Versioned, verified Platform language catalog revisions."
        abstract = False
        indexes = (("status", "sequence"),)
