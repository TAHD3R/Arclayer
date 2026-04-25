from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.tenancy.workspace_tenant import WorkspaceTenantIsolationMode, WorkspaceTenantStatus


class Migration(migrations.Migration):
    dependencies = [("models", "0019_auto_20260424_1457")]

    initial = False

    operations = [
        ops.CreateModel(
            name="WorkspaceTenantRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "workspace",
                    fields.ForeignKeyField(
                        "models.Workspace",
                        source_field="workspace_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="tenant_records",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "organization",
                    fields.ForeignKeyField(
                        "models.Organization",
                        source_field="organization_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="workspace_tenant_records",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("schema_name", fields.CharField(unique=True, max_length=64)),
                (
                    "isolation_mode",
                    fields.CharEnumField(
                        default=WorkspaceTenantIsolationMode.WORKSPACE_SCHEMA,
                        description="WORKSPACE_SCHEMA: workspace_schema",
                        enum_type=WorkspaceTenantIsolationMode,
                        max_length=32,
                    ),
                ),
                (
                    "status",
                    fields.CharEnumField(
                        default=WorkspaceTenantStatus.PENDING,
                        db_index=True,
                        description="PENDING: pending\nREADY: ready\nFAILED: failed",
                        enum_type=WorkspaceTenantStatus,
                        max_length=16,
                    ),
                ),
                ("schema_version", fields.IntField(default=0)),
                ("failure_reason", fields.TextField(null=True)),
            ],
            options={
                "table": "tenant_workspace_registry",
                "app": "models",
                "unique_together": (("workspace_id",), ("schema_name",)),
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
    ]
