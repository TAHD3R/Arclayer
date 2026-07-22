from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.design_systems._enums import DesignSystemOwnerKind
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0042_auto_20260720_2152')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentRunDesignSystemSnapshotV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('run', fields.OneToOneField('models.AgentRunV1Record', source_field='run_id', db_constraint=True, to_field='id', related_name='design_system_snapshot', on_delete=OnDelete.CASCADE)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('assignment_id', fields.UUIDField(db_index=True)),
                ('assignment_revision', fields.IntField()),
                ('design_system_id', fields.UUIDField(db_index=True)),
                ('design_system_version_id', fields.UUIDField(db_index=True)),
                ('owner_kind', fields.CharEnumField(description='WORKSPACE: workspace\nPROJECT: project', enum_type=DesignSystemOwnerKind, max_length=16)),
                ('manifest_checksum', fields.CharField(db_index=True, max_length=71)),
                ('validation_finding_hash', fields.CharField(max_length=71)),
                ('token_index_hash', fields.CharField(max_length=71)),
                ('context_hash', fields.CharField(db_index=True, max_length=71)),
                ('context_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('context_byte_size', fields.IntField()),
            ],
            options={'table': 'ai_run_design_system_snapshots', 'app': 'models', 'indexes': [Index(fields=['project_id', 'created_at']), Index(fields=['design_system_version_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Exact immutable Design System context captured for project-scoped Agent Runs.'},
            bases=['BaseModel'],
        ),
    ]
