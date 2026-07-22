from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from src.models.builder._enums import BuilderApprovalClass, BuilderApprovalStatus
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0045_auto_20260721_0009')]

    initial = False

    operations = [
        ops.CreateModel(
            name='BuilderChangeSetApprovalRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace_id', fields.UUIDField(db_index=True)),
                ('project_id', fields.UUIDField(db_index=True)),
                ('change_set', fields.OneToOneField('models.BuilderChangeSetRecord', source_field='change_set_id', db_constraint=True, to_field='id', related_name='approval_checkpoint', on_delete=OnDelete.CASCADE)),
                ('approval_class', fields.CharEnumField(db_index=True, description='NONE: none\nREVIEW: review\nDESTRUCTIVE: destructive', enum_type=BuilderApprovalClass, max_length=16)),
                ('operations_hash', fields.CharField(db_index=True, max_length=71)),
                ('status', fields.CharEnumField(default=BuilderApprovalStatus.PENDING, db_index=True, description='PENDING: pending\nAPPROVED: approved\nCONSUMED: consumed\nEXPIRED: expired', db_default=BuilderApprovalStatus.PENDING, enum_type=BuilderApprovalStatus, max_length=16)),
                ('requested_by_user_id', fields.UUIDField(db_index=True)),
                ('approved_by_user_id', fields.UUIDField(null=True, db_index=True)),
                ('expires_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('approved_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('consumed_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'builder_change_set_approvals', 'app': 'models', 'indexes': [Index(fields=['project_id', 'status', 'expires_at']), Index(fields=['workspace_id', 'requested_by_user_id', 'status'])], 'pk_attr': 'id', 'table_description': 'Human approval checkpoints bound to typed Builder ChangeSets.'},
            bases=['BaseModel'],
        ),
    ]
