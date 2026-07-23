from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.system.plugin_installation import PluginArtifactState, PluginSourceType


class Migration(migrations.Migration):
    dependencies = [("models", "0070_plugin_installation_configuration")]

    initial = False

    operations = [
        ops.CreateModel(
            name="PluginArtifactRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("plugin_name", fields.CharField(db_index=True, max_length=128)),
                ("version", fields.CharField(db_index=True, max_length=64)),
                (
                    "source_type",
                    fields.CharEnumField(
                        db_index=True,
                        description="BUNDLED: bundled\nCATALOG: catalog\nMANUAL_UPLOAD: manual_upload",
                        enum_type=PluginSourceType,
                        max_length=24,
                    ),
                ),
                ("source_locator", fields.CharField(max_length=1024)),
                (
                    "state",
                    fields.CharEnumField(
                        default=PluginArtifactState.REVIEWED,
                        db_index=True,
                        description="REVIEWED: reviewed\nSTAGED: staged\nACTIVE: active\nRETAINED: retained\nFAILED: failed",
                        enum_type=PluginArtifactState,
                        max_length=24,
                    ),
                ),
                ("archive_path", fields.CharField(null=True, max_length=1024)),
                ("package_path", fields.CharField(null=True, max_length=1024)),
                ("artifact_checksum", fields.CharField(max_length=80)),
                ("package_checksum", fields.CharField(max_length=80)),
                ("manifest_digest", fields.CharField(max_length=80)),
                ("detached_signature", fields.TextField(unique=False)),
                ("signer_fingerprint", fields.CharField(db_index=True, max_length=64)),
                ("provenance_status", fields.CharField(max_length=32)),
                ("size_bytes", fields.BigIntField()),
                ("compatibility", fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ("review_projection", fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ("failure_code", fields.CharField(null=True, max_length=128)),
                ("failure_summary", fields.CharField(null=True, max_length=512)),
                ("uploaded_by_user_id", fields.UUIDField(null=True, db_index=True)),
            ],
            options={
                "table": "system_plugin_artifacts",
                "app": "models",
                "unique_together": (("artifact_checksum", "signer_fingerprint"),),
                "indexes": [
                    Index(fields=["plugin_name", "version", "created_at"]),
                    Index(fields=["state", "updated_at"]),
                ],
                "pk_attr": "id",
                "table_description": "Immutable signed plugin package artifacts reviewed for lifecycle operations.",
            },
            bases=["BaseModel"],
        ),
        ops.AddField(
            model_name="PluginInstallationRecord",
            name="active_artifact",
            field=fields.ForeignKeyField(
                "models.PluginArtifactRecord",
                source_field="active_artifact_id",
                null=True,
                db_constraint=True,
                to_field="id",
                related_name="active_installations",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
        ops.AddField(
            model_name="PluginInstallationRecord",
            name="previous_artifact",
            field=fields.ForeignKeyField(
                "models.PluginArtifactRecord",
                source_field="previous_artifact_id",
                null=True,
                db_constraint=True,
                to_field="id",
                related_name="previous_installations",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
        ops.AddField(
            model_name="PluginOperationRecord",
            name="artifact",
            field=fields.ForeignKeyField(
                "models.PluginArtifactRecord",
                source_field="artifact_id",
                null=True,
                db_constraint=True,
                to_field="id",
                related_name="operations",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
        ops.AddField(
            model_name="PluginOperationRecord",
            name="previous_artifact",
            field=fields.ForeignKeyField(
                "models.PluginArtifactRecord",
                source_field="previous_artifact_id",
                null=True,
                db_constraint=True,
                to_field="id",
                related_name="rollback_operations",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
    ]
