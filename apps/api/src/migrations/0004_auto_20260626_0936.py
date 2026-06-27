from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.agents.approval import AgentApprovalStatus, AgentApprovalTargetType
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0003_auto_20260626_0831')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentApprovalRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='agent_approvals', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', db_constraint=True, to_field='id', related_name='agent_approvals', on_delete=OnDelete.CASCADE)),
                ('agent_run', fields.ForeignKeyField('models.AgentRunRecord', source_field='agent_run_id', null=True, db_constraint=True, to_field='id', related_name='approvals', on_delete=OnDelete.SET_NULL)),
                ('requester_user_id', fields.UUIDField(db_index=True)),
                ('approver_user_id', fields.UUIDField(null=True, db_index=True)),
                ('skill_id', fields.CharField(db_index=True, max_length=96)),
                ('tool_name', fields.CharField(null=True, db_index=True, max_length=128)),
                ('action', fields.CharField(db_index=True, max_length=128)),
                ('target_type', fields.CharEnumField(db_index=True, description='CONTENT_ITEM: content_item', enum_type=AgentApprovalTargetType, max_length=32)),
                ('target_id', fields.UUIDField(null=True, db_index=True)),
                ('expected_draft_version', fields.IntField(null=True)),
                ('target_snapshot', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('proposed_patch', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('dry_run', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('status', fields.CharEnumField(default=AgentApprovalStatus.PENDING, db_index=True, description='PENDING: pending\nAPPROVED: approved\nREJECTED: rejected\nEXPIRED: expired\nAPPLIED: applied', enum_type=AgentApprovalStatus, max_length=16)),
                ('expires_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('approved_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('rejected_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('expired_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('applied_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('decision_reason', fields.CharField(null=True, max_length=512)),
            ],
            options={'table': 'agent_approvals', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Durable approval checkpoints for Agent proposed write actions.'},
            bases=['BaseModel'],
        ),
    ]
