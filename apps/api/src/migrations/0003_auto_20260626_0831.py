from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.agents.conversation import AgentConversationMode
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0002_auto_20260625_2348')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentConversationRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='agent_conversations', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', null=True, db_constraint=True, to_field='id', related_name='agent_conversations', on_delete=OnDelete.CASCADE)),
                ('user_id', fields.UUIDField(db_index=True)),
                ('title', fields.CharField(max_length=160)),
                ('mode', fields.CharEnumField(db_index=True, description='BUILD: build\nPLAN: plan\nAGENT: agent', enum_type=AgentConversationMode, max_length=16)),
                ('model', fields.CharField(null=True, max_length=128)),
                ('reasoning_effort', fields.CharField(null=True, max_length=16)),
                ('messages', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('context_snapshot', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('runtime_id', fields.UUIDField(null=True, db_index=True)),
                ('site_id', fields.UUIDField(null=True, db_index=True)),
                ('environment_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'agent_conversations', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Persistent workspace AI conversations and page context snapshots.'},
            bases=['BaseModel'],
        ),
    ]
