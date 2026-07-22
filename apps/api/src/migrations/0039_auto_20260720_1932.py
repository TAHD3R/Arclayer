from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.skills._enums import SkillPackageScope
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0038_auto_20260720_1919')]

    initial = False

    operations = [
        ops.CreateModel(
            name='SkillInstallationRemovalRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='skill_installation_removals', on_delete=OnDelete.CASCADE)),
                ('installation_id', fields.UUIDField(db_index=True)),
                ('package_scope', fields.CharEnumField(description='SYSTEM: system\nWORKSPACE: workspace', enum_type=SkillPackageScope, max_length=16)),
                ('package_id', fields.UUIDField(db_index=True)),
                ('version_id', fields.UUIDField(db_index=True)),
                ('expected_installation_revision', fields.IntField()),
                ('impact', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('removed_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('removed_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('request_idempotency_key', fields.CharField(max_length=128)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('result_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'skill_installation_removals', 'app': 'models', 'unique_together': (('workspace_id', 'installation_id'), ('workspace_id', 'request_idempotency_key')), 'indexes': [Index(fields=['workspace_id', 'removed_at', 'id'])], 'pk_attr': 'id', 'table_description': 'Idempotent, audited Workspace Skill uninstall outcomes.'},
            bases=['BaseModel'],
        ),
    ]
