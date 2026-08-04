from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.knowledge._enums import (
    KnowledgeGuidanceCommandKind,
    KnowledgeGuidancePreviewKind,
    KnowledgeGuidancePreviewStatus,
    KnowledgeGuidanceRevisionStatus,
    KnowledgeGuidanceScope,
    KnowledgeProjectGuidanceMode,
)


class Migration(migrations.Migration):
    dependencies = [("models", "0112_platform_current_mfa_action")]
    initial = False
    operations = [
        ops.CreateModel(
            name="KnowledgeGuidanceLayerRecord",
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
                        related_name="knowledge_guidance_layers",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "scope_kind",
                    fields.CharEnumField(
                        db_index=True,
                        description="WORKSPACE: workspace\nPROJECT: project",
                        enum_type=KnowledgeGuidanceScope,
                        max_length=16,
                    ),
                ),
                ("scope_id", fields.UUIDField(db_index=True)),
                (
                    "project_mode",
                    fields.CharEnumField(
                        description="SUPPLEMENT: supplement\nOVERRIDE: override",
                        enum_type=KnowledgeProjectGuidanceMode,
                        max_length=16,
                        null=True,
                    ),
                ),
                ("metadata_revision", fields.IntField(default=1)),
                ("draft_revision_id", fields.UUIDField(null=True, db_index=True)),
                ("published_revision_id", fields.UUIDField(null=True, db_index=True)),
                ("removed_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ("removed_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("updated_by_user_id", fields.UUIDField(null=True, db_index=True)),
            ],
            options={
                "table": "knowledge_guidance_layers",
                "app": "models",
                "unique_together": (("workspace_id", "scope_kind", "scope_id"),),
                "indexes": [Index(fields=["workspace_id", "scope_kind", "updated_at"])],
                "pk_attr": "id",
                "table_description": "Canonical Workspace and Project guidance layers.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="KnowledgeGuidanceRevisionRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "guidance_layer",
                    fields.ForeignKeyField(
                        "models.KnowledgeGuidanceLayerRecord",
                        source_field="guidance_layer_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="revisions",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("workspace_id", fields.UUIDField(db_index=True)),
                ("revision_number", fields.IntField()),
                ("content", fields.TextField(unique=False)),
                ("content_hash", fields.CharField(db_index=True, max_length=71)),
                (
                    "status",
                    fields.CharEnumField(
                        default=KnowledgeGuidanceRevisionStatus.DRAFT,
                        db_index=True,
                        description="DRAFT: draft\nPUBLISHED: published\nSUPERSEDED: superseded",
                        enum_type=KnowledgeGuidanceRevisionStatus,
                        max_length=16,
                    ),
                ),
                ("restored_from_revision_id", fields.UUIDField(null=True, db_index=True)),
                ("published_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ("published_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("request_idempotency_key", fields.CharField(max_length=128)),
                ("request_fingerprint", fields.CharField(max_length=64)),
            ],
            options={
                "table": "knowledge_guidance_revisions",
                "app": "models",
                "unique_together": (
                    ("guidance_layer_id", "revision_number"),
                    ("guidance_layer_id", "request_idempotency_key"),
                ),
                "indexes": [Index(fields=["workspace_id", "guidance_layer_id", "status"])],
                "pk_attr": "id",
                "table_description": "Immutable content revisions for canonical Knowledge guidance.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="KnowledgeGuidanceReferenceRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "guidance_layer",
                    fields.ForeignKeyField(
                        "models.KnowledgeGuidanceLayerRecord",
                        source_field="guidance_layer_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="references",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("workspace_id", fields.UUIDField(db_index=True)),
                ("knowledge_base_id", fields.UUIDField(db_index=True)),
                ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
            ],
            options={
                "table": "knowledge_guidance_references",
                "app": "models",
                "unique_together": (("guidance_layer_id", "knowledge_base_id"),),
                "indexes": [Index(fields=["workspace_id", "knowledge_base_id"])],
                "pk_attr": "id",
                "table_description": ("Optional existing Knowledge source collections attached to canonical guidance."),
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="KnowledgeGuidancePreviewRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "guidance_layer",
                    fields.ForeignKeyField(
                        "models.KnowledgeGuidanceLayerRecord",
                        source_field="guidance_layer_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="previews",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("workspace_id", fields.UUIDField(db_index=True)),
                (
                    "kind",
                    fields.CharEnumField(
                        db_index=True,
                        description="RESTORE: restore\nREMOVE: remove",
                        enum_type=KnowledgeGuidancePreviewKind,
                        max_length=16,
                    ),
                ),
                (
                    "status",
                    fields.CharEnumField(
                        default=KnowledgeGuidancePreviewStatus.ACTIVE,
                        db_index=True,
                        description="ACTIVE: active\nAPPLIED: applied",
                        enum_type=KnowledgeGuidancePreviewStatus,
                        max_length=16,
                    ),
                ),
                ("expected_layer_revision", fields.IntField()),
                ("preview_revision", fields.IntField(default=1)),
                ("source_revision_id", fields.UUIDField(null=True, db_index=True)),
                ("snapshot", fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ("request_idempotency_key", fields.CharField(max_length=128)),
                ("request_fingerprint", fields.CharField(max_length=64)),
                ("actor_user_id", fields.UUIDField(null=True, db_index=True)),
                ("applied_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ("applied_by_user_id", fields.UUIDField(null=True, db_index=True)),
            ],
            options={
                "table": "knowledge_guidance_previews",
                "app": "models",
                "unique_together": (("guidance_layer_id", "kind", "request_idempotency_key"),),
                "indexes": [Index(fields=["workspace_id", "guidance_layer_id", "status"])],
                "pk_attr": "id",
                "table_description": ("Revision-bound restore and removal previews for canonical Knowledge guidance."),
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="KnowledgeGuidanceCommandRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "guidance_layer",
                    fields.ForeignKeyField(
                        "models.KnowledgeGuidanceLayerRecord",
                        source_field="guidance_layer_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="commands",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("workspace_id", fields.UUIDField(db_index=True)),
                (
                    "kind",
                    fields.CharEnumField(
                        db_index=True,
                        description=(
                            "PUBLISH: publish\nRESTORE: restore\nREMOVE: remove\n"
                            "REFERENCE_ATTACH: reference_attach\nREFERENCE_DETACH: reference_detach"
                        ),
                        enum_type=KnowledgeGuidanceCommandKind,
                        max_length=32,
                    ),
                ),
                ("request_idempotency_key", fields.CharField(max_length=128)),
                ("request_fingerprint", fields.CharField(max_length=64)),
                ("result_snapshot", fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ("actor_user_id", fields.UUIDField(null=True, db_index=True)),
            ],
            options={
                "table": "knowledge_guidance_commands",
                "app": "models",
                "unique_together": (("guidance_layer_id", "kind", "request_idempotency_key"),),
                "indexes": [Index(fields=["workspace_id", "guidance_layer_id", "kind"])],
                "pk_attr": "id",
                "table_description": "Idempotent command receipts for canonical Knowledge guidance mutations.",
            },
            bases=["BaseModel"],
        ),
    ]
