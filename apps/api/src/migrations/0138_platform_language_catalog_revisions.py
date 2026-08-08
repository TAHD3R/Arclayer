from enum import StrEnum

from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.data import JSON_DUMPS
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7


class PlatformLanguageCatalogRevisionStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    RETIRED = "retired"


class Migration(migrations.Migration):
    dependencies = [("models", "0137_platform_system_settings_command_receipts")]
    initial = False

    operations = [
        ops.CreateModel(
            name="PlatformLanguageCatalogRevision",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("sequence", fields.IntField(unique=True, db_index=True)),
                (
                    "status",
                    fields.CharEnumField(
                        PlatformLanguageCatalogRevisionStatus,
                        db_index=True,
                        max_length=9,
                    ),
                ),
                ("enabled_locales", fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ("default_locale", fields.CharField(max_length=16)),
                ("impact_snapshot", fields.JSONField(encoder=JSON_DUMPS, decoder=loads, null=True)),
                ("actor_user_id", fields.UUIDField(db_index=True)),
                ("published_at", fields.DatetimeField(db_index=True, null=True)),
            ],
            options={
                "table": "platform_language_catalog_revisions",
                "app": "models",
                "indexes": [Index(fields=["status", "sequence"])],
                "pk_attr": "id",
                "table_description": "Versioned, verified Platform language catalog revisions.",
            },
            bases=["BaseModel"],
        )
    ]
