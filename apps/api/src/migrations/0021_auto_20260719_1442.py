from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0020_auto_20260719_1432')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentChangeSetV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='ai_change_sets', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.ProjectRecord', source_field='project_id', null=True, db_constraint=True, to_field='id', related_name='ai_change_sets', on_delete=OnDelete.CASCADE)),
                ('thread', fields.ForeignKeyField('models.AgentThreadV1Record', source_field='thread_id', db_constraint=True, to_field='id', related_name='change_sets', on_delete=OnDelete.CASCADE)),
                ('run', fields.ForeignKeyField('models.AgentRunV1Record', source_field='run_id', db_constraint=True, to_field='id', related_name='change_sets', on_delete=OnDelete.CASCADE)),
                ('change_set_id', fields.CharField(unique=True, max_length=192)),
                ('base_revision_id', fields.CharField(max_length=192)),
                ('preview_ref', fields.CharField(max_length=512)),
                ('summary_key', fields.CharField(max_length=256)),
                ('summary_params', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('warnings', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('required_approval_ids', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'ai_change_sets', 'app': 'models', 'indexes': [Index(fields=['run_id', 'created_at'])], 'pk_attr': 'id'},
            bases=['BaseModel'],
        ),
    ]
