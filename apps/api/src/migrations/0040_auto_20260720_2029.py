from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0039_auto_20260720_1932')]

    initial = False

    operations = [
        ops.CreateModel(
            name='SkillPackageArchiveRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='skill_package_archives', on_delete=OnDelete.CASCADE)),
                ('package_id', fields.UUIDField(db_index=True)),
                ('expected_package_revision', fields.IntField()),
                ('impact', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('archived_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('archived_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('result_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'skill_package_archives', 'app': 'models', 'unique_together': (('workspace_id', 'package_id'), ('workspace_id', 'request_idempotency_key')), 'indexes': [Index(fields=['workspace_id', 'archived_at', 'id'])], 'pk_attr': 'id', 'table_description': 'Idempotent, audited Workspace Skill package archive outcomes.'},
            bases=['BaseModel'],
        ),
        ops.AddField(
            model_name='SkillPackageRecord',
            name='archived_at',
            field=fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False),
        ),
        ops.AddField(
            model_name='SkillPackageRecord',
            name='archived_by_user_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
    ]
