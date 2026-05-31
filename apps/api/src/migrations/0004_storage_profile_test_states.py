from tortoise import fields, migrations
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7


class Migration(migrations.Migration):
    dependencies = [("models", "0003_auth_email_verification")]

    initial = False

    operations = [
        ops.CreateModel(
            name="StorageProfileTestStateRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("scope_type", fields.CharField(default="system", max_length=32, db_index=True)),
                ("scope_id", fields.UUIDField(db_index=True)),
                ("profile_key", fields.CharField(max_length=128, db_index=True)),
                ("last_test_status", fields.CharField(max_length=32)),
                ("last_test_message", fields.TextField(null=True)),
                ("last_tested_at", fields.DatetimeField(auto_now=False, auto_now_add=False)),
            ],
            options={
                "table": "system_storage_profile_test_states",
                "app": "models",
                "unique_together": (("scope_type", "scope_id", "profile_key"),),
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.RunSQL(
            sql="""
            INSERT INTO system_storage_profile_test_states (
                id,
                created_at,
                updated_at,
                scope_type,
                scope_id,
                profile_key,
                last_test_status,
                last_test_message,
                last_tested_at
            )
            SELECT
                (
                    substr(md5(scope_type || scope_id::text || profile_key), 1, 8) || '-' ||
                    substr(md5(scope_type || scope_id::text || profile_key), 9, 4) || '-' ||
                    substr(md5(scope_type || scope_id::text || profile_key), 13, 4) || '-' ||
                    substr(md5(scope_type || scope_id::text || profile_key), 17, 4) || '-' ||
                    substr(md5(scope_type || scope_id::text || profile_key), 21, 12)
                )::uuid,
                created_at,
                updated_at,
                scope_type,
                scope_id,
                profile_key,
                last_test_status,
                last_test_message,
                COALESCE(last_tested_at, updated_at)
            FROM system_storage_profiles
            WHERE last_test_status IN ('passed', 'failed')
            ON CONFLICT (scope_type, scope_id, profile_key) DO NOTHING
            """,
            reverse_sql="DELETE FROM system_storage_profile_test_states",
        ),
    ]
