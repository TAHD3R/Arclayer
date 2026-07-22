from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from src.models.design_systems._enums import DesignSystemVersionStatus
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0048_auto_20260721_0349')]

    initial = False

    operations = [
        ops.CreateModel(
            name='DesignSystemVersionStateRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('design_system_version', fields.OneToOneField('models.DesignSystemVersionRecord', source_field='design_system_version_id', db_constraint=True, to_field='id', related_name='lifecycle_state', on_delete=OnDelete.CASCADE)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('status', fields.CharEnumField(default=DesignSystemVersionStatus.CANDIDATE, db_index=True, description='CANDIDATE: candidate\nVALIDATING: validating\nVALID: valid\nPUBLISHED: published\nINVALID: invalid\nSUPERSEDED: superseded\nARCHIVED: archived', enum_type=DesignSystemVersionStatus, max_length=16)),
                ('status_revision', fields.IntField(default=1)),
                ('superseded_by_version_id', fields.UUIDField(null=True, db_index=True)),
                ('status_changed_at', fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ('status_changed_by_user_id', fields.UUIDField(null=True, db_index=True)),
            ],
            options={'table': 'design_system_version_states', 'app': 'models', 'indexes': [Index(fields=['workspace_id', 'status', 'updated_at'])], 'pk_attr': 'id', 'table_description': 'Mutable lifecycle state for immutable Design System versions.'},
            bases=['BaseModel'],
        ),
    ]
