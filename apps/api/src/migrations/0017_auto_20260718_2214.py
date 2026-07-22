from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.agents.runtime_v1 import AgentExecutionModeV1, AgentRunStatusV1
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0016_auto_20260717_1019')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentThreadV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='ai_threads', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', null=True, db_constraint=True, to_field='id', related_name='ai_threads', on_delete=OnDelete.CASCADE)),
                ('owner_user_id', fields.UUIDField(db_index=True)),
                ('lead_agent_id', fields.CharField(db_index=True, max_length=160)),
                ('title', fields.CharField(max_length=160)),
                ('archived_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'ai_threads', 'app': 'models', 'indexes': [Index(fields=['workspace_id', 'owner_user_id', 'updated_at'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='AgentRunV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='ai_runs', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', null=True, db_constraint=True, to_field='id', related_name='ai_runs_v1', on_delete=OnDelete.CASCADE)),
                ('thread', fields.ForeignKeyField('models.AgentThreadV1Record', source_field='thread_id', db_constraint=True, to_field='id', related_name='runs', on_delete=OnDelete.CASCADE)),
                ('owner_user_id', fields.UUIDField(db_index=True)),
                ('idempotency_key', fields.CharField(max_length=192)),
                ('execution_mode', fields.CharEnumField(description='PLAN: plan\nBUILD: build', enum_type=AgentExecutionModeV1, max_length=16)),
                ('lead_agent_id', fields.CharField(db_index=True, max_length=160)),
                ('mentioned_agent_ids', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('site_revision_id', fields.UUIDField(null=True, db_index=True)),
                ('status', fields.CharEnumField(db_index=True, description='CREATED: created\nQUEUED: queued\nRUNNING: running\nCANCELLATION_REQUESTED: cancellation_requested\nINTERRUPTED: interrupted\nCOMPLETED: completed\nCANCELLED: cancelled\nFAILED: failed', enum_type=AgentRunStatusV1, max_length=32)),
                ('correlation_id', fields.CharField(db_index=True, max_length=192)),
                ('last_sequence', fields.IntField(default=0)),
                ('last_cursor', fields.CharField(null=True, unique=True, max_length=512)),
                ('cancellation_requested_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('terminal_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('usage', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ('settlement', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ('error', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'ai_runs', 'app': 'models', 'unique_together': (('thread_id', 'owner_user_id', 'idempotency_key'),), 'indexes': [Index(fields=['workspace_id', 'owner_user_id', 'status'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='AgentMessageV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('thread', fields.ForeignKeyField('models.AgentThreadV1Record', source_field='thread_id', db_constraint=True, to_field='id', related_name='messages', on_delete=OnDelete.CASCADE)),
                ('run', fields.ForeignKeyField('models.AgentRunV1Record', source_field='run_id', db_constraint=True, to_field='id', related_name='messages', on_delete=OnDelete.CASCADE)),
                ('role', fields.CharField(max_length=16)),
                ('status', fields.CharField(max_length=32)),
                ('agent_id', fields.CharField(null=True, db_index=True, max_length=160)),
                ('actor_user_id', fields.UUIDField(null=True, db_index=True)),
                ('placement_kind', fields.CharField(default='thread', max_length=16)),
            ],
            options={'table': 'ai_messages', 'app': 'models', 'indexes': [Index(fields=['thread_id', 'created_at']), Index(fields=['run_id', 'created_at'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='AgentMessagePartV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('message', fields.ForeignKeyField('models.AgentMessageV1Record', source_field='message_id', db_constraint=True, to_field='id', related_name='parts', on_delete=OnDelete.CASCADE)),
                ('part_index', fields.IntField()),
                ('type', fields.CharField(db_index=True, max_length=32)),
                ('status', fields.CharField(db_index=True, max_length=32)),
                ('text', fields.TextField(null=True, unique=False)),
                ('tool_call_id', fields.CharField(null=True, unique=True, max_length=192)),
                ('payload', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'ai_message_parts', 'app': 'models', 'unique_together': (('message_id', 'part_index'),), 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='AgentRunEventV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('run', fields.ForeignKeyField('models.AgentRunV1Record', source_field='run_id', db_constraint=True, to_field='id', related_name='events', on_delete=OnDelete.CASCADE)),
                ('event_version', fields.IntField()),
                ('event_id', fields.CharField(unique=True, max_length=192)),
                ('cursor', fields.CharField(unique=True, max_length=512)),
                ('type', fields.CharField(db_index=True, max_length=64)),
                ('sequence', fields.IntField()),
                ('occurred_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('correlation_id', fields.CharField(db_index=True, max_length=192)),
                ('span_id', fields.CharField(null=True, db_index=True, max_length=192)),
                ('parent_span_id', fields.CharField(null=True, db_index=True, max_length=192)),
                ('payload', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'ai_run_events', 'app': 'models', 'unique_together': (('run_id', 'sequence'),), 'indexes': [Index(fields=['run_id', 'occurred_at'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
    ]
