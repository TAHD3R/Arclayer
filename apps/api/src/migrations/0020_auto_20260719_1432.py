from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.agents.runtime_delegation_v1 import AgentDelegationStatusV1
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0019_auto_20260719_1404')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentDelegationV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='ai_delegations', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', null=True, db_constraint=True, to_field='id', related_name='ai_delegations', on_delete=OnDelete.CASCADE)),
                ('thread', fields.ForeignKeyField('models.AgentThreadV1Record', source_field='thread_id', db_constraint=True, to_field='id', related_name='delegations', on_delete=OnDelete.CASCADE)),
                ('parent_run', fields.ForeignKeyField('models.AgentRunV1Record', source_field='parent_run_id', db_constraint=True, to_field='id', related_name='child_delegations', on_delete=OnDelete.CASCADE)),
                ('child_run', fields.ForeignKeyField('models.AgentRunV1Record', source_field='child_run_id', db_constraint=True, to_field='id', related_name='parent_delegations', on_delete=OnDelete.CASCADE)),
                ('parent_message_part', fields.ForeignKeyField('models.AgentMessagePartV1Record', source_field='parent_message_part_id', db_constraint=True, to_field='id', related_name='delegations', on_delete=OnDelete.CASCADE)),
                ('owner_user_id', fields.UUIDField(db_index=True)),
                ('delegation_id', fields.CharField(unique=True, max_length=192)),
                ('parent_tool_call_id', fields.CharField(db_index=True, max_length=192)),
                ('source_agent_version_id', fields.CharField(max_length=192)),
                ('target_agent_version_id', fields.CharField(max_length=192)),
                ('status', fields.CharEnumField(db_index=True, description='DELEGATED: delegated\nCOMPLETED: completed\nFAILED: failed', enum_type=AgentDelegationStatusV1, max_length=16)),
                ('delegated_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('completed_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('failed_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('objective_summary', fields.TextField(unique=False)),
                ('summary', fields.TextField(null=True, unique=False)),
                ('artifact_refs', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('error', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'ai_delegations', 'app': 'models', 'unique_together': (('parent_run_id', 'parent_tool_call_id'), ('child_run_id',)), 'indexes': [Index(fields=['workspace_id', 'owner_user_id', 'status'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.AddField(
            model_name='AgentRunEventV1Record',
            name='source_event_id',
            field=fields.CharField(null=True, unique=True, max_length=192),
        ),
    ]
