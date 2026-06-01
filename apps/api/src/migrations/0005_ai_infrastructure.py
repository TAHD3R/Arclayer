from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.ai.ai_api_key import KeyOwnerType, KeyType
from src.models.ai.ai_audit_log import AuditLogSource, AuditLogStatus
from src.models.ai.ai_budget import BudgetSourceType
from src.models.ai.ai_budget_reservation import ReservationStatus
from src.models.ai.model_policy import ModelPolicyScope
from src.models.ai.user_key_grant import GrantApprovalState


class Migration(migrations.Migration):
    dependencies = [("models", "0004_storage_profile_test_states")]

    initial = False

    operations = [
        ops.CreateModel(
            name="AIBudget",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("source_type", fields.CharEnumField(enum_type=BudgetSourceType, max_length=9, db_index=True)),
                ("source_id", fields.UUIDField(db_index=True)),
                ("limit_micros", fields.BigIntField()),
                ("spent_micros", fields.BigIntField(default=0)),
                ("reserved_micros", fields.BigIntField(default=0)),
                ("period_start", fields.DateField()),
            ],
            options={
                "table": "ai_budgets",
                "app": "models",
                "pk_attr": "id",
                "unique_together": (("source_type", "source_id", "period_start"),),
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="AIBudgetReservation",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "budget",
                    fields.ForeignKeyField(
                        "models.AIBudget",
                        source_field="budget_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="reservations",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("request_id", fields.UUIDField(unique=True, db_index=True)),
                ("estimated_cost_micros", fields.BigIntField()),
                ("reserved_cost_micros", fields.BigIntField()),
                ("actual_cost_micros", fields.BigIntField(null=True)),
                (
                    "status",
                    fields.CharEnumField(
                        enum_type=ReservationStatus,
                        max_length=9,
                        default=ReservationStatus.RESERVED,
                        db_index=True,
                    ),
                ),
                ("expires_at", fields.DatetimeField()),
            ],
            options={
                "table": "ai_budget_reservations",
                "app": "models",
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="ModelPolicy",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "scope",
                    fields.CharEnumField(
                        enum_type=ModelPolicyScope,
                        max_length=9,
                        default=ModelPolicyScope.WORKSPACE,
                        db_index=True,
                    ),
                ),
                ("scope_id", fields.UUIDField(null=True, db_index=True)),
                ("name", fields.CharField(max_length=128)),
                ("description", fields.TextField(null=True)),
                ("allowed_models", fields.JSONField(default=list)),
                ("max_tokens_per_request", fields.IntField(null=True)),
                ("max_cost_micros_per_request", fields.BigIntField(null=True)),
                ("data_retention_enabled", fields.BooleanField(default=False)),
                ("priority", fields.IntField(default=100, db_index=True)),
                ("is_active", fields.BooleanField(default=True, db_index=True)),
            ],
            options={
                "table": "model_policies",
                "app": "models",
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="UserKeyWorkspaceGrant",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("user_id", fields.UUIDField(db_index=True)),
                ("workspace_id", fields.UUIDField(db_index=True)),
                ("api_key_id", fields.UUIDField(db_index=True)),
                (
                    "approval_state",
                    fields.CharEnumField(
                        enum_type=GrantApprovalState,
                        max_length=8,
                        default=GrantApprovalState.PENDING,
                        db_index=True,
                    ),
                ),
                ("approved_by", fields.UUIDField(null=True)),
                ("approved_at", fields.DatetimeField(null=True)),
                ("revoked_at", fields.DatetimeField(null=True)),
                ("notes", fields.TextField(null=True)),
            ],
            options={
                "table": "user_key_workspace_grants",
                "app": "models",
                "pk_attr": "id",
                "unique_together": (("user_id", "workspace_id", "api_key_id"),),
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="AIAuditLog",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("correlation_id", fields.UUIDField(db_index=True)),
                ("workspace_id", fields.UUIDField(db_index=True)),
                ("user_id", fields.UUIDField(null=True, db_index=True)),
                ("source", fields.CharEnumField(enum_type=AuditLogSource, max_length=5, db_index=True)),
                ("provider", fields.CharField(max_length=50)),
                ("model", fields.CharField(max_length=100)),
                ("request_type", fields.CharField(max_length=20)),
                ("prompt_tokens", fields.BigIntField()),
                ("completion_tokens", fields.BigIntField()),
                ("cost_micros", fields.BigIntField()),
                ("duration_ms", fields.IntField(null=True)),
                ("status", fields.CharEnumField(enum_type=AuditLogStatus, max_length=12, db_index=True)),
                ("error_code", fields.CharField(max_length=50, null=True)),
                ("error_message", fields.TextField(null=True)),
            ],
            options={
                "table": "ai_audit_log",
                "app": "models",
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="AIAPIKey",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("owner_type", fields.CharEnumField(enum_type=KeyOwnerType, max_length=9, db_index=True)),
                ("owner_id", fields.UUIDField(db_index=True)),
                ("key_type", fields.CharEnumField(enum_type=KeyType, max_length=13)),
                ("provider", fields.CharField(max_length=50)),
                ("litellm_key_id", fields.CharField(max_length=255, null=True)),
                ("key_hash", fields.CharField(max_length=255, null=True)),
                ("is_active", fields.BooleanField(default=True, db_index=True)),
                ("last_used_at", fields.DatetimeField(null=True)),
                ("expires_at", fields.DatetimeField(null=True)),
            ],
            options={
                "table": "ai_api_keys",
                "app": "models",
                "pk_attr": "id",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="AIUsageDaily",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ("workspace_id", fields.UUIDField(db_index=True)),
                ("date", fields.DateField()),
                ("source_type", fields.CharEnumField(enum_type=BudgetSourceType, max_length=9, db_index=True)),
                ("provider", fields.CharField(max_length=50)),
                ("model", fields.CharField(max_length=100)),
                ("request_count", fields.IntField(default=0)),
                ("prompt_tokens", fields.BigIntField(default=0)),
                ("completion_tokens", fields.BigIntField(default=0)),
                ("cost_micros", fields.BigIntField(default=0)),
            ],
            options={
                "table": "ai_usage_daily",
                "app": "models",
                "pk_attr": "id",
                "unique_together": (("workspace_id", "date", "source_type", "provider", "model"),),
            },
            bases=["BaseModel"],
        ),
    ]
