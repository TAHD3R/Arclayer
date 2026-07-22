from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from src.models.skills._enums import SkillPackageScope
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0036_auto_20260720_1724')]

    initial = False

    operations = [
        ops.CreateModel(
            name='AgentRunSkillSnapshotV1Record',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('run', fields.ForeignKeyField('models.AgentRunV1Record', source_field='run_id', db_constraint=True, to_field='id', related_name='skill_snapshots', on_delete=OnDelete.CASCADE)),
                ('agent_assignment_id', fields.UUIDField(db_index=True)),
                ('agent_version_id', fields.UUIDField(db_index=True)),
                ('agent_order', fields.IntField()),
                ('skill_order', fields.IntField()),
                ('installation_id', fields.UUIDField(db_index=True)),
                ('package_scope', fields.CharEnumField(description='SYSTEM: system\nWORKSPACE: workspace', enum_type=SkillPackageScope, max_length=16)),
                ('package_id', fields.UUIDField(db_index=True)),
                ('skill_version_id', fields.UUIDField(db_index=True)),
                ('package_checksum', fields.CharField(max_length=71)),
                ('validation_policy_version', fields.IntField()),
                ('validation_finding_hash', fields.CharField(max_length=71)),
                ('context_byte_size', fields.IntField()),
            ],
            options={'table': 'ai_run_skill_snapshots', 'app': 'models', 'unique_together': (('run_id', 'agent_assignment_id', 'installation_id'),), 'indexes': [Index(fields=['run_id', 'agent_order', 'skill_order']), Index(fields=['installation_id', 'created_at']), Index(fields=['skill_version_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Exact immutable Skill references pinned when an Agent Run is created.'},
            bases=['BaseModel'],
        ),
        ops.AddField(
            model_name='AgentVersionRecord',
            name='skill_grant_workspace_id',
            field=fields.UUIDField(null=True, db_index=True),
        ),
    ]
