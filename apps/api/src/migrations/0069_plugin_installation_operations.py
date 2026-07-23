from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.system.plugin_installation import (
    PluginLifecycleState,
    PluginOperationKind,
    PluginOperationState,
    PluginRuntimeActivationState,
    PluginSourceType,
)


class Migration(migrations.Migration):
    dependencies = [("models", "0068_backfill_email_template_revisions")]

    initial = False

    operations = [
        ops.CreateModel(
            name="PluginInstallationRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("plugin_name", fields.CharField(unique=True, max_length=128)),
                (
                    "source_type",
                    fields.CharEnumField(
                        db_index=True,
                        description="BUNDLED: bundled\nCATALOG: catalog\nMANUAL_UPLOAD: manual_upload",
                        enum_type=PluginSourceType,
                        max_length=24,
                    ),
                ),
                ("source_locator", fields.CharField(max_length=512)),
                ("installed_version", fields.CharField(null=True, db_index=True, max_length=64)),
                ("available_version", fields.CharField(null=True, max_length=64)),
                ("previous_version", fields.CharField(null=True, max_length=64)),
                ("rollback_version", fields.CharField(null=True, max_length=64)),
                ("package_checksum", fields.CharField(null=True, max_length=80)),
                ("manifest_digest", fields.CharField(null=True, max_length=80)),
                ("provenance_status", fields.CharField(null=True, max_length=32)),
                ("compatibility", fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                (
                    "lifecycle_state",
                    fields.CharEnumField(
                        default=PluginLifecycleState.INSTALLED,
                        db_index=True,
                        description="INSTALLING: installing\nINSTALLED: installed\nUPDATE_AVAILABLE: update_available\nUPGRADING: upgrading\nDISABLING: disabling\nDISABLED: disabled\nUNINSTALLING: uninstalling\nFAILED: failed\nROLLBACK_REQUIRED: rollback_required",
                        enum_type=PluginLifecycleState,
                        max_length=32,
                    ),
                ),
                ("desired_enabled", fields.BooleanField(default=True, db_index=True)),
                (
                    "runtime_activation_state",
                    fields.CharEnumField(
                        default=PluginRuntimeActivationState.NOT_REQUIRED,
                        db_index=True,
                        description="NOT_REQUIRED: not_required\nPENDING_RESTART: pending_restart\nVERIFIED: verified\nFAILED: failed",
                        enum_type=PluginRuntimeActivationState,
                        max_length=24,
                    ),
                ),
                ("enabled_capabilities", fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ("requested_permissions", fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ("approved_permissions", fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ("configuration_revision", fields.IntField(default=1)),
                ("secret_references", fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ("current_operation_id", fields.UUIDField(null=True, db_index=True)),
                ("current_job_id", fields.UUIDField(null=True, db_index=True)),
                ("last_success_summary", fields.CharField(null=True, max_length=512)),
                ("last_failure_code", fields.CharField(null=True, max_length=128)),
                ("last_failure_summary", fields.CharField(null=True, max_length=512)),
                ("installed_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("updated_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("installed_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ("runtime_verified_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={
                "table": "system_plugin_installations",
                "app": "models",
                "indexes": [
                    Index(fields=["lifecycle_state", "updated_at"]),
                    Index(fields=["runtime_activation_state", "updated_at"]),
                ],
                "pk_attr": "id",
                "table_description": "Durable installation and runtime activation state for system plugins.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PluginOperationRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "installation",
                    fields.ForeignKeyField(
                        "models.PluginInstallationRecord",
                        source_field="installation_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="operations",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                ("plugin_name", fields.CharField(db_index=True, max_length=128)),
                (
                    "kind",
                    fields.CharEnumField(
                        db_index=True,
                        description="INSTALL: install\nUPGRADE: upgrade\nROLLBACK: rollback\nENABLE: enable\nDISABLE: disable\nUNINSTALL: uninstall",
                        enum_type=PluginOperationKind,
                        max_length=16,
                    ),
                ),
                (
                    "state",
                    fields.CharEnumField(
                        default=PluginOperationState.QUEUED,
                        db_index=True,
                        description="QUEUED: queued\nRUNNING: running\nWAITING_FOR_RESTART: waiting_for_restart\nSUCCEEDED: succeeded\nFAILED: failed\nCANCELLED: cancelled",
                        enum_type=PluginOperationState,
                        max_length=24,
                    ),
                ),
                ("phase", fields.CharField(default="queued", max_length=96)),
                ("progress_completed", fields.IntField(default=0)),
                ("progress_total", fields.IntField(null=True)),
                ("job_id", fields.UUIDField(null=True, unique=True)),
                ("idempotency_key_hash", fields.CharField(unique=True, max_length=64)),
                ("request_fingerprint", fields.CharField(max_length=64)),
                ("requested_version", fields.CharField(null=True, max_length=64)),
                ("previous_version", fields.CharField(null=True, max_length=64)),
                ("package_checksum", fields.CharField(null=True, max_length=80)),
                ("manifest_digest", fields.CharField(null=True, max_length=80)),
                ("permission_diff", fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ("migration_warnings", fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ("restart_required", fields.BooleanField(default=False)),
                ("activation_verified", fields.BooleanField(default=False)),
                ("retryable", fields.BooleanField(default=False)),
                ("failure_code", fields.CharField(null=True, max_length=128)),
                ("failure_summary", fields.CharField(null=True, max_length=512)),
                ("requested_by_user_id", fields.UUIDField(db_index=True)),
                ("started_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ("completed_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={
                "table": "system_plugin_operations",
                "app": "models",
                "indexes": [Index(fields=["plugin_name", "created_at"]), Index(fields=["state", "updated_at"])],
                "pk_attr": "id",
                "table_description": "Idempotent durable lifecycle operations for system plugins.",
            },
            bases=["BaseModel"],
        ),
    ]
