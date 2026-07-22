from tortoise import fields, migrations
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7


class Migration(migrations.Migration):
    dependencies = [("models", "0055_auto_20260722_1317")]

    initial = False

    operations = [
        ops.CreateModel(
            name="HTTPRequestRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("occurred_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ("trace_id", fields.CharField(null=True, db_index=True, max_length=128)),
                ("actor_user_id", fields.UUIDField(null=True, db_index=True)),
                ("workspace_id", fields.UUIDField(null=True, db_index=True)),
                ("project_id", fields.UUIDField(null=True, db_index=True)),
                ("route_template", fields.CharField(max_length=512)),
                ("method", fields.CharField(max_length=8)),
                ("status_code", fields.SmallIntField()),
                ("duration_ms", fields.IntField()),
            ],
            options={
                "table": "observability_http_request_records",
                "app": "models",
                "indexes": [
                    Index(fields=["workspace_id", "occurred_at"]),
                    Index(fields=["project_id", "occurred_at"]),
                    Index(fields=["route_template", "method", "occurred_at"]),
                    Index(fields=["status_code", "occurred_at"]),
                ],
                "pk_attr": "id",
                "table_description": "Completed HTTP requests retained for tracing and latency percentiles.",
            },
            bases=["BaseModel"],
        ),
    ]
