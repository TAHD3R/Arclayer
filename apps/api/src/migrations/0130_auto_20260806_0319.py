from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0129_auto_20260807_0044')]

    initial = False

    operations = [
        ops.CreateModel(
            name='WorkspaceAutoRefillCommandReceipt',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='auto_refill_command_receipts', on_delete=OnDelete.CASCADE)),
                ('actor_user_id', fields.UUIDField(db_index=True)),
                ('idempotency_key_hash', fields.CharField(max_length=64)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('result_revision', fields.BigIntField()),
                ('result_snapshot', fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ('audit_event', fields.ForeignKeyField('models.AuditEvent', source_field='audit_event_id', db_constraint=True, to_field='id', related_name='commerce_auto_refill_command_receipts', on_delete=OnDelete.RESTRICT)),
            ],
            options={'table': 'commerce_workspace_auto_refill_command_receipts', 'app': 'models', 'unique_together': (('workspace_id', 'idempotency_key_hash'),), 'indexes': [Index(fields=['workspace_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Durable idempotency receipts for automatic top-up policy commands.'},
            bases=['BaseModel'],
        ),
    ]
