from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0010_auto_20260713_0317')]

    initial = False

    operations = [
        ops.CreateModel(
            name='BillingProviderEventReceipt',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('provider', fields.CharField(max_length=32)),
                ('event_id', fields.CharField(max_length=255)),
                ('workspace_id', fields.UUIDField(db_index=True)),
            ],
            options={'table': 'commerce_billing_provider_event_receipts', 'app': 'models', 'unique_together': (('provider', 'event_id'),), 'indexes': [Index(fields=['workspace_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Idempotency receipts for signed external billing events.'},
            bases=['BaseModel'],
        ),
    ]
