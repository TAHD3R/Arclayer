from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops

from apps.api.src.common.utils.ids import uuid7


class Migration(migrations.Migration):
    operations = [
        ops.CreateModel(
            name="UserTwoFactor",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "user",
                    fields.OneToOneField(
                        "models.User",
                        source_field="user_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="two_factor",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("totp_secret_enc", fields.CharField(max_length=1024)),
                ("enabled_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={
                "table": "user_two_factor",
                "app": "models",
                "pk_attr": "id",
                "table_description": "User TOTP (2FA) configuration.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="UserTwoFactorBackupCode",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "user",
                    fields.ForeignKeyField(
                        "models.User",
                        source_field="user_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="two_factor_backup_codes",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("salt", fields.CharField(max_length=64)),
                ("code_hash", fields.CharField(max_length=128)),
                ("used_at", fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={
                "table": "user_two_factor_backup_codes",
                "app": "models",
                "pk_attr": "id",
                "table_description": "One-time backup codes for 2FA.",
            },
            bases=["BaseModel"],
        ),
    ]
