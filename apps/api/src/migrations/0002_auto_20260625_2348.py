from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.agents.types import AgentRunStatus
from src.common.utils.ids import uuid7
from src.models.automation.flow import AutomationOperationKind, AutomationTriggerKind
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0001_initial')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentRunRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='agent_runs', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', db_constraint=True, to_field='id', related_name='agent_runs', on_delete=OnDelete.CASCADE)),
                ('user_id', fields.UUIDField(db_index=True)),
                ('agent_id', fields.CharField(db_index=True, max_length=64)),
                ('status', fields.CharEnumField(db_index=True, description='QUEUED: queued\nRUNNING: running\nCOMPLETED: completed\nCANCELLED: cancelled\nFAILED: failed', enum_type=AgentRunStatus, max_length=16)),
                ('prompt', fields.TextField(unique=False)),
                ('model', fields.CharField(null=True, max_length=128)),
                ('result', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ('tool_outputs', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('events', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('cancellation_requested', fields.BooleanField(default=False, db_index=True)),
                ('error_code', fields.CharField(null=True, max_length=64)),
                ('error_message', fields.TextField(null=True, unique=False)),
                ('correlation_id', fields.CharField(db_index=True, max_length=128)),
                ('runtime_id', fields.UUIDField(null=True, db_index=True)),
                ('site_id', fields.UUIDField(null=True, db_index=True)),
                ('environment_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'agent_runs', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Persistent project Agent run state snapshots.'},
            bases=['BaseModel'],
        ),
        ops.AlterField(
            model_name='AutomationFlow',
            name='trigger_kind',
            field=fields.CharEnumField(db_index=True, description='PUBLISH_COMPLETED: publish_completed\nCONTENT_CREATED: content_created\nCONTENT_TRANSITIONED: content_transitioned\nAPI_KEY_ROTATED: api_key_rotated\nPREVIEW_TOKEN_CREATED: preview_token_created', enum_type=AutomationTriggerKind, max_length=32),
        ),
        ops.AlterField(
            model_name='AutomationOperation',
            name='kind',
            field=fields.CharEnumField(db_index=True, description='WEBHOOK: webhook\nHTTP_REQUEST: http_request\nAGENT_ANALYSIS: agent_analysis\nCONTENT_READ: content_read\nCONTENT_UPDATE: content_update\nRELEASE_PUBLISH: release_publish\nNOTIFICATION: notification', enum_type=AutomationOperationKind, max_length=32),
        ),
    ]
