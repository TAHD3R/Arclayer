from tortoise import migrations
from tortoise.migrations import operations as ops
from src.agents.types import AgentRunStatus
from src.common.utils.ids import uuid7
from src.models.agents.approval import AgentApprovalTargetType
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0005_auto_20260626_1045')]

    initial = False

    operations = [
        ops.CreateModel(
            name='ProjectSourceFileRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', db_constraint=True, to_field='id', related_name='source_files', on_delete=OnDelete.CASCADE)),
                ('path', fields.CharField(db_index=True, max_length=1024)),
                ('role', fields.CharField(max_length=32)),
                ('language', fields.CharField(max_length=64)),
                ('contents', fields.TextField(unique=False)),
                ('is_deleted', fields.BooleanField(default=False, db_index=True)),
                ('created_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('updated_by_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'project_source_files', 'app': 'models', 'unique_together': (('project_id', 'path'),), 'pk_attr': 'id', 'table_description': 'Managed source file overlay records for project source trees.'},
            bases=['BaseModel'],
        ),
        ops.AlterField(
            model_name='AgentApprovalRecord',
            name='target_type',
            field=fields.CharEnumField(db_index=True, description='CONTENT_ITEM: content_item\nCONTENT_MODEL: content_model', enum_type=AgentApprovalTargetType, max_length=32),
        ),
        ops.AlterField(
            model_name='AgentRunRecord',
            name='status',
            field=fields.CharEnumField(db_index=True, description='QUEUED: queued\nRUNNING: running\nINTERRUPTED: interrupted\nCOMPLETED: completed\nCANCELLED: cancelled\nFAILED: failed', enum_type=AgentRunStatus, max_length=16),
        ),
    ]
