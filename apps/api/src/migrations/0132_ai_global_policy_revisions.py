from typing import Any, cast

from tortoise import fields, migrations
from tortoise.fields.data import JSON_DUMPS
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.ai.global_policy import GlobalAiPolicyRevisionStatus


class Migration(migrations.Migration):
    dependencies = [("models", "0131_retire_ai_services_workspace_rollout")]
    initial = False

    operations = [
        ops.CreateModel(
            name="GlobalAiPolicyRevision",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("sequence", fields.IntField()),
                (
                    "status",
                    cast(
                        Any,
                        fields.CharEnumField(
                            enum_type=GlobalAiPolicyRevisionStatus,
                            max_length=9,
                            default=GlobalAiPolicyRevisionStatus.DRAFT,
                            db_index=True,
                        ),
                    ),
                ),
                ("allowed_models", fields.JSONField(default=list, encoder=JSON_DUMPS)),
                ("default_model", fields.CharField(max_length=255, null=True)),
                ("max_tokens_per_request", fields.IntField(default=0)),
                ("max_cost_micros_per_request", fields.BigIntField(default=0)),
                ("max_concurrent_runs", fields.IntField(default=0)),
                ("external_data_egress_allowed", fields.BooleanField(default=False)),
                ("tool_allowlist", fields.JSONField(default=list, encoder=JSON_DUMPS)),
                ("approval_required_effect_classes", fields.JSONField(default=list, encoder=JSON_DUMPS)),
                ("retry_limit", fields.IntField(default=0)),
                ("retention_days", fields.IntField(default=0)),
                ("content_hash", fields.CharField(max_length=64, unique=True)),
                ("published_at", fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ("applied_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ("applied_idempotency_key_hash", fields.CharField(max_length=64, null=True)),
                ("applied_request_fingerprint", fields.CharField(max_length=64, null=True)),
            ],
            options={
                "table": "ai_global_policy_revisions",
                "app": "models",
                "unique_together": (("sequence", "status"),),
                "indexes": [Index(fields=["status", "sequence"])],
                "pk_attr": "id",
                "table_description": "Immutable deployment-wide AI policy revisions.",
            },
            bases=["BaseModel"],
        ),
    ]
