from enum import StrEnum

from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.data import JSON_DUMPS
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.builder._enums import BuilderProvenanceSource


class BuilderDraftCheckpointStatus(StrEnum):
    DRAFT = "draft"
    CONFLICT = "conflict"
    APPLIED = "applied"
    DISCARDED = "discarded"


class Migration(migrations.Migration):
    dependencies = [("models", "0138_platform_language_catalog_revisions")]
    initial = False

    operations = [
        ops.CreateModel(
            name="BuilderRestoreLineageRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("project_id", fields.UUIDField(db_index=True)),
                ("site_id", fields.UUIDField(db_index=True)),
                ("environment_id", fields.UUIDField(db_index=True)),
                ("restore_revision_id", fields.UUIDField(unique=True, db_index=True)),
                ("source_revision_id", fields.UUIDField(db_index=True)),
                ("target_revision_id", fields.UUIDField(db_index=True)),
            ],
            options={
                "table": "builder_restore_lineages",
                "app": "models",
                "unique_together": [("project_id", "restore_revision_id")],
                "pk_attr": "id",
                "table_description": "Explicit Builder restore source and target revision pairs.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="ContentItemDeletionRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("workspace_id", fields.UUIDField(db_index=True)),
                ("site_id", fields.UUIDField(db_index=True)),
                ("environment_id", fields.UUIDField(null=True, db_index=True)),
                ("item_id", fields.UUIDField(db_index=True)),
                ("deletion_sequence", fields.IntField()),
                ("snapshot", fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ("deleted_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("deleted_at", fields.DatetimeField(db_index=True)),
                ("restored_at", fields.DatetimeField(null=True, db_index=True)),
                ("restored_by_user_id", fields.UUIDField(null=True, db_index=True)),
            ],
            options={
                "table": "content_item_deletion_records",
                "app": "models",
                "indexes": [
                    Index(fields=["workspace_id", "site_id", "environment_id", "item_id", "restored_at"]),
                    Index(fields=["workspace_id", "deleted_at"]),
                ],
                "pk_attr": "id",
                "table_description": "Retained ContentItem aggregate snapshots for explicit restore operations.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="BuilderDraftCheckpointRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("workspace_id", fields.UUIDField(db_index=True)),
                ("project_id", fields.UUIDField(db_index=True)),
                ("site_id", fields.UUIDField(db_index=True)),
                ("environment_id", fields.UUIDField(db_index=True)),
                ("actor_user_id", fields.UUIDField(db_index=True)),
                ("client_session_id", fields.CharField(max_length=128)),
                ("base_revision_id", fields.UUIDField(db_index=True)),
                ("base_etag", fields.CharField(max_length=71)),
                ("checkpoint_version", fields.IntField()),
                ("operations", fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ("operations_hash", fields.CharField(max_length=71)),
                ("status", fields.CharEnumField(BuilderDraftCheckpointStatus, default=BuilderDraftCheckpointStatus.DRAFT, max_length=16, db_index=True)),
                ("provenance_source", fields.CharEnumField(BuilderProvenanceSource, max_length=16)),
                ("agent_run_id", fields.UUIDField(null=True, db_index=True)),
                ("agent_id", fields.UUIDField(null=True, db_index=True)),
                ("last_idempotency_key", fields.CharField(max_length=128, null=True)),
                ("last_request_fingerprint", fields.CharField(max_length=64, null=True)),
                ("conflict_meta", fields.JSONField(null=True)),
                ("applied_change_set_id", fields.UUIDField(null=True, db_index=True)),
                ("discarded_at", fields.DatetimeField(null=True)),
            ],
            options={
                "table": "builder_draft_checkpoints",
                "app": "models",
                "unique_together": [("project_id", "site_id", "environment_id", "actor_user_id", "client_session_id")],
                "indexes": [
                    Index(fields=["project_id", "actor_user_id", "status", "updated_at"]),
                    Index(fields=["workspace_id", "project_id", "base_revision_id"]),
                ],
                "pk_attr": "id",
                "table_description": "Durable Builder draft checkpoints separate from immutable revision history.",
            },
            bases=["BaseModel"],
        ),
    ]
