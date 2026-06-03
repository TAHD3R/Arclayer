"""Add workspace extension activation persistence and AI key secret field."""

from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.extensions.workspace_extension_activation import WorkspaceExtensionActivationStatus


class Migration(migrations.Migration):
    dependencies = [("models", "0006_workspace_extension_revision")]

    initial = False

    operations = [
        ops.CreateModel(
            name="WorkspaceExtensionActivation",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("extension_name", fields.CharField(max_length=128, db_index=True)),
                (
                    "workspace",
                    fields.ForeignKeyField(
                        "models.Workspace",
                        source_field="workspace_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="extension_activations",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "status",
                    fields.CharEnumField(
                        enum_type=WorkspaceExtensionActivationStatus,
                        max_length=8,
                        default=WorkspaceExtensionActivationStatus.ACTIVE,
                        db_index=True,
                    ),
                ),
                ("activated_at", fields.DatetimeField(null=True)),
                ("deactivated_at", fields.DatetimeField(null=True)),
            ],
            options={
                "table": "domain_workspace_extension_activations",
                "app": "models",
                "pk_attr": "id",
                "unique_together": (("extension_name", "workspace_id"),),
            },
            bases=["BaseModel"],
        ),
    ]
