from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.extensions.workspace_extension_activation import WorkspaceExtensionActivationStatus
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0005_ai_infrastructure')]

    initial = False

    operations = [
        ops.CreateModel(
            name='WorkspaceExtensionActivation',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('extension_name', fields.CharField(db_index=True, max_length=128)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='extension_activations', on_delete=OnDelete.CASCADE)),
                ('status', fields.CharEnumField(default=WorkspaceExtensionActivationStatus.ACTIVE, db_index=True, description='ACTIVE: active\nINACTIVE: inactive', enum_type=WorkspaceExtensionActivationStatus, max_length=8)),
                ('activated_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('deactivated_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'workspace_extension_activations', 'app': 'models', 'unique_together': (('extension_name', 'workspace_id'),), 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.AlterModelOptions(
            name='AIAPIKey',
            options={'table': 'ai_api_keys', 'app': 'models', 'pk_attr': 'id', 'table_description': 'API key for AI provider access.'},
        ),
        ops.AddField(
            model_name='AIAPIKey',
            name='metadata_json',
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
        ops.AddField(
            model_name='AIAPIKey',
            name='virtual_key_enc',
            field=fields.TextField(null=True, unique=False),
        ),
        ops.AlterModelOptions(
            name='AIAuditLog',
            options={'table': 'ai_audit_log', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Append-only audit log for AI API calls.'},
        ),
        ops.AlterField(
            model_name='AIAuditLog',
            name='workspace_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AlterModelOptions(
            name='AIBudget',
            options={'table': 'ai_budgets', 'app': 'models', 'unique_together': (('source_type', 'source_id', 'period_start'),), 'pk_attr': 'id', 'table_description': 'Per-funding-source monthly budget envelope.'},
        ),
        ops.AlterModelOptions(
            name='AIBudgetReservation',
            options={'table': 'ai_budget_reservations', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Per-request budget hold record.'},
        ),
        ops.AlterModelOptions(
            name='AIUsageDaily',
            options={'table': 'ai_usage_daily', 'app': 'models', 'unique_together': (('workspace_id', 'date', 'source_type', 'provider', 'model'),), 'pk_attr': 'id', 'table_description': 'Daily aggregated AI usage statistics.'},
        ),
        ops.AlterModelOptions(
            name='ModelPolicy',
            options={'table': 'model_policies', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Access policy for LLM model usage.'},
        ),
        ops.AlterModelOptions(
            name='UserKeyWorkspaceGrant',
            options={'table': 'user_key_workspace_grants', 'app': 'models', 'unique_together': (('user_id', 'workspace_id', 'api_key_id'),), 'pk_attr': 'id', 'table_description': "Grants a user's personal API key access to a workspace."},
        ),
        ops.RunSQL(
            'ALTER TABLE "workspaces" ADD COLUMN "extension_revision" BIGINT NOT NULL DEFAULT 1',
        ),
    ]
