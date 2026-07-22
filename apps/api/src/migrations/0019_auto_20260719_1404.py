from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.agents.runtime_v1 import AgentApprovalStatusV1, AgentToolResponseKindV1
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0018_auto_20260718_2235')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentApprovalV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='ai_approvals', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', null=True, db_constraint=True, to_field='id', related_name='ai_approvals', on_delete=OnDelete.CASCADE)),
                ('thread', fields.ForeignKeyField('models.AgentThreadV1Record', source_field='thread_id', db_constraint=True, to_field='id', related_name='approvals', on_delete=OnDelete.CASCADE)),
                ('run', fields.ForeignKeyField('models.AgentRunV1Record', source_field='run_id', db_constraint=True, to_field='id', related_name='approvals', on_delete=OnDelete.CASCADE)),
                ('message_part', fields.ForeignKeyField('models.AgentMessagePartV1Record', source_field='message_part_id', db_constraint=True, to_field='id', related_name='approvals', on_delete=OnDelete.CASCADE)),
                ('owner_user_id', fields.UUIDField(db_index=True)),
                ('approval_id', fields.CharField(unique=True, max_length=192)),
                ('approval_version', fields.IntField()),
                ('tool_call_id', fields.CharField(db_index=True, max_length=192)),
                ('checkpoint_id', fields.CharField(db_index=True, max_length=192)),
                ('status', fields.CharEnumField(db_index=True, description='PENDING: pending\nAPPROVED: approved\nREJECTED: rejected\nCANCELLED: cancelled\nEXPIRED: expired', enum_type=AgentApprovalStatusV1, max_length=16)),
                ('requested_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('expires_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('resolved_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('resolved_by_actor_id', fields.UUIDField(null=True, db_index=True)),
                ('policy_version', fields.CharField(max_length=192)),
                ('risk', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('options', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('selected_option_id', fields.CharField(null=True, max_length=192)),
                ('resolution_reason', fields.CharField(null=True, max_length=1000)),
            ],
            options={'table': 'ai_approvals', 'app': 'models', 'unique_together': (('run_id', 'tool_call_id', 'checkpoint_id'),), 'indexes': [Index(fields=['workspace_id', 'owner_user_id', 'status'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='AgentToolResponseV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='ai_tool_responses', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', null=True, db_constraint=True, to_field='id', related_name='ai_tool_responses', on_delete=OnDelete.CASCADE)),
                ('thread', fields.ForeignKeyField('models.AgentThreadV1Record', source_field='thread_id', db_constraint=True, to_field='id', related_name='tool_responses', on_delete=OnDelete.CASCADE)),
                ('run', fields.ForeignKeyField('models.AgentRunV1Record', source_field='run_id', db_constraint=True, to_field='id', related_name='tool_responses', on_delete=OnDelete.CASCADE)),
                ('approval', fields.ForeignKeyField('models.AgentApprovalV1Record', source_field='approval_id', null=True, db_constraint=True, to_field='id', related_name='responses', on_delete=OnDelete.CASCADE)),
                ('actor_user_id', fields.UUIDField(db_index=True)),
                ('response_id', fields.CharField(unique=True, max_length=192)),
                ('kind', fields.CharEnumField(db_index=True, description='APPROVAL: approval\nHUMAN_RESULT: human_result', enum_type=AgentToolResponseKindV1, max_length=16)),
                ('tool_call_id', fields.CharField(db_index=True, max_length=192)),
                ('checkpoint_id', fields.CharField(db_index=True, max_length=192)),
                ('idempotency_key', fields.CharField(max_length=192)),
                ('payload', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('consumed_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'ai_tool_responses', 'app': 'models', 'unique_together': (('run_id', 'actor_user_id', 'idempotency_key'),), 'indexes': [Index(fields=['run_id', 'checkpoint_id', 'kind'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='checkpoint_id',
            field=fields.CharField(null=True, db_index=True, max_length=192),
        ),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='interrupt_approval_id',
            field=fields.CharField(null=True, db_index=True, max_length=192),
        ),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='interrupt_id',
            field=fields.CharField(null=True, db_index=True, max_length=192),
        ),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='interrupt_reason',
            field=fields.CharField(null=True, max_length=64),
        ),
        ops.AddField(
            model_name='AgentRunV1Record',
            name='interrupt_tool_call_id',
            field=fields.CharField(null=True, db_index=True, max_length=192),
        ),
    ]
