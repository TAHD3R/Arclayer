from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from src.models.commerce.payments import CommerceCheckoutOutcome, CommerceCheckoutStatus
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0120_migration_state_reconciliation')]

    initial = False

    operations = [
        ops.CreateModel(
            name='CommerceCheckoutOutcomeCommand',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('checkout_session', fields.ForeignKeyField('models.CommerceCheckoutSession', source_field='checkout_session_id', db_constraint=True, to_field='id', related_name='outcome_commands', on_delete=OnDelete.RESTRICT)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='commerce_checkout_outcome_commands', on_delete=OnDelete.RESTRICT)),
                ('actor_user_id', fields.UUIDField(db_index=True)),
                ('outcome', fields.CharEnumField(db_index=True, description='PENDING: pending\nSUCCEEDED: succeeded\nFAILED: failed\nCANCELED: canceled', enum_type=CommerceCheckoutOutcome, max_length=9)),
                ('expected_revision', fields.BigIntField()),
                ('idempotency_key', fields.CharField(unique=True, max_length=160)),
                ('request_fingerprint', fields.CharField(max_length=64)),
                ('provider_event_id', fields.CharField(unique=True, max_length=255)),
                ('event_created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('accepted_inbox_id', fields.UUIDField(null=True, db_index=True)),
                ('accepted_job_id', fields.UUIDField(null=True, db_index=True)),
                ('accepted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('processed_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('result_status', fields.CharEnumField(null=True, description='PENDING: pending\nCOMPLETED: completed\nFAILED: failed\nCANCELED: canceled\nEXPIRED: expired', enum_type=CommerceCheckoutStatus, max_length=9)),
                ('result_revision', fields.BigIntField(null=True)),
                ('revision', fields.BigIntField(default=1)),
            ],
            options={'table': 'commerce_checkout_outcome_commands', 'app': 'models', 'indexes': [Index(fields=['workspace_id', 'created_at']), Index(fields=['checkout_session_id', 'created_at'])], 'pk_attr': 'id', 'table_description': 'Durable simulated Checkout outcome command and Provider event evidence.'},
            bases=['BaseModel'],
        ),
    ]
