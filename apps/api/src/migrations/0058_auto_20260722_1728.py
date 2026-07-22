from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.commerce.billing import BillingProviderMode, ConnectorEventInboxStatus
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0057_auto_20260722_1657')]

    initial = False

    operations = [
        ops.CreateModel(
            name='ConnectorEventInbox',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('provider', fields.CharField(max_length=32)),
                ('provider_mode', fields.CharEnumField(description='TEST: test\nLIVE: live', enum_type=BillingProviderMode, max_length=8)),
                ('provider_account_id', fields.CharField(max_length=255)),
                ('provider_event_id', fields.CharField(max_length=255)),
                ('connector_key', fields.CharField(max_length=128)),
                ('connector_version', fields.CharField(max_length=64)),
                ('event_type', fields.CharField(db_index=True, max_length=160)),
                ('signature_timestamp', fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ('payload_sha256', fields.CharField(max_length=64)),
                ('encrypted_payload', fields.TextField(unique=False)),
                ('retention_deadline', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('status', fields.CharEnumField(default=ConnectorEventInboxStatus.RECEIVED, db_index=True, description='RECEIVED: received\nPROCESSING: processing\nPROCESSED: processed\nFAILED: failed', enum_type=ConnectorEventInboxStatus, max_length=16)),
                ('processing_attempts', fields.IntField(default=0)),
                ('job_id', fields.UUIDField(null=True, unique=True)),
                ('processed_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('last_error_code', fields.CharField(null=True, max_length=96)),
                ('last_error_message', fields.TextField(null=True, unique=False)),
                ('result_reference', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'connector_event_inbox', 'app': 'models', 'unique_together': (('provider', 'provider_mode', 'provider_account_id', 'provider_event_id'),), 'indexes': [Index(fields=['status', 'created_at']), Index(fields=['connector_key', 'connector_version', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Encrypted raw Connector events and durable processing authority.'},
            bases=['BaseModel'],
        ),
    ]
