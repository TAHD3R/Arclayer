from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7


class Migration(migrations.Migration):
    dependencies = [("models", "0136_platform_system_settings_permissions")]
    initial = False

    operations = [
        ops.CreateModel(
            name="PlatformSystemSettingsCommandReceipt",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("section", fields.CharField(max_length=64)),
                ("idempotency_key_hash", fields.CharField(max_length=64, unique=True)),
                ("request_fingerprint", fields.CharField(max_length=64)),
                ("actor_user_id", fields.UUIDField(db_index=True)),
                ("result_revision", fields.BigIntField()),
                ("result_snapshot", fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                (
                    "audit_event",
                    fields.ForeignKeyField(
                        "models.AuditEvent",
                        source_field="audit_event_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="platform_system_settings_command_receipts",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
            ],
            options={
                "table": "platform_system_settings_command_receipts",
                "app": "models",
                "indexes": [
                    Index(fields=["section", "created_at"]),
                    Index(fields=["actor_user_id", "created_at"]),
                ],
                "pk_attr": "id",
                "table_description": "Exact idempotency and audit evidence for Platform System Settings writes.",
            },
            bases=["BaseModel"],
        )
    ]
