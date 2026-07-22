from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.agents.catalog import AgentDefinitionScope, AgentLifecycleState, AgentVersionState
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0029_auto_20260719_1929')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentDefinitionRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', null=True, db_constraint=True, to_field='id', related_name='agent_definitions', on_delete=OnDelete.CASCADE)),
                ('stable_key', fields.CharField(unique=True, max_length=192)),
                ('scope', fields.CharEnumField(db_index=True, description='SYSTEM: system\nWORKSPACE: workspace', enum_type=AgentDefinitionScope, max_length=16)),
                ('slug', fields.CharField(db_index=True, max_length=96)),
                ('display_name', fields.CharField(max_length=128)),
                ('name_i18n_key', fields.CharField(null=True, max_length=160)),
                ('role', fields.CharField(max_length=96)),
                ('role_i18n_key', fields.CharField(null=True, max_length=160)),
                ('description', fields.CharField(max_length=1000)),
                ('description_i18n_key', fields.CharField(null=True, max_length=160)),
                ('avatar_url', fields.CharField(null=True, max_length=1024)),
                ('lifecycle_state', fields.CharEnumField(default=AgentLifecycleState.ACTIVE, db_index=True, description='ACTIVE: active\nDISABLED: disabled\nARCHIVED: archived', enum_type=AgentLifecycleState, max_length=16)),
                ('is_official', fields.BooleanField(default=False, db_index=True)),
                ('created_by_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'agent_definitions', 'app': 'models', 'unique_together': (('workspace_id', 'slug'),), 'indexes': [Index(fields=['scope', 'lifecycle_state'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='AgentVersionRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('definition', fields.ForeignKeyField('models.AgentDefinitionRecord', source_field='definition_id', db_constraint=True, to_field='id', related_name='versions', on_delete=OnDelete.CASCADE)),
                ('version_number', fields.IntField()),
                ('state', fields.CharEnumField(db_index=True, description='PUBLISHED: published\nRETIRED: retired', enum_type=AgentVersionState, max_length=16)),
                ('instructions', fields.TextField(unique=False)),
                ('model_policy', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('supported_execution_modes', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('tool_grants', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('skill_installation_ids', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('knowledge_base_ids', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('delegation_definition_ids', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('approval_profile', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('compatibility', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('provenance', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('content_checksum', fields.CharField(max_length=64)),
                ('published_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('created_by_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'agent_versions', 'app': 'models', 'unique_together': (('definition_id', 'version_number'),), 'indexes': [Index(fields=['definition_id', 'state'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='AgentAssignmentRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='agent_assignments', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', null=True, db_constraint=True, to_field='id', related_name='agent_assignments', on_delete=OnDelete.CASCADE)),
                ('definition', fields.ForeignKeyField('models.AgentDefinitionRecord', source_field='definition_id', db_constraint=True, to_field='id', related_name='assignments', on_delete=OnDelete.CASCADE)),
                ('version', fields.ForeignKeyField('models.AgentVersionRecord', source_field='version_id', db_constraint=True, to_field='id', related_name='assignments', on_delete=OnDelete.RESTRICT)),
                ('assignment_key', fields.CharField(unique=True, max_length=256)),
                ('enabled', fields.BooleanField(default=True, db_index=True)),
                ('is_default', fields.BooleanField(default=False, db_index=True)),
                ('is_pinned', fields.BooleanField(default=False, db_index=True)),
                ('sort_order', fields.IntField(default=0)),
                ('last_used_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('assigned_by_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'agent_assignments', 'app': 'models', 'indexes': [Index(fields=['workspace_id', 'project_id', 'enabled']), Index(fields=['workspace_id', 'is_pinned', 'last_used_at'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.RemoveField(model_name='AgentConversationRecord', name='project'),
        ops.RemoveField(model_name='AgentConversationRecord', name='workspace'),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='lead_agent_assignment_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='lead_agent_version_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='mentioned_agent_assignment_ids',
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='mentioned_agent_version_ids',
            field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
        ),
        ops.RunSQL(
            "UPDATE ai_runs SET mentioned_agent_assignment_ids = '[]'::jsonb "
            "WHERE mentioned_agent_assignment_ids IS NULL; "
            "UPDATE ai_runs SET mentioned_agent_version_ids = '[]'::jsonb "
            "WHERE mentioned_agent_version_ids IS NULL",
            "UPDATE ai_runs SET mentioned_agent_assignment_ids = NULL, mentioned_agent_version_ids = NULL",
        ),
        ops.AlterField(
            model_name='AgentRunV1Record',
            name='mentioned_agent_assignment_ids',
            field=fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads),
        ),
        ops.AlterField(
            model_name='AgentRunV1Record',
            name='mentioned_agent_version_ids',
            field=fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads),
        ),
        ops.AddField(
            model_name='AgentThreadV1Record',
            name='lead_agent_assignment_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
        ops.AddField(
            model_name='AgentThreadV1Record',
            name='lead_agent_version_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
    ]
