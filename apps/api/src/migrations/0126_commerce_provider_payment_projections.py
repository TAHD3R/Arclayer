from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import CommerceInvoiceStatus, CommerceTransactionStatus
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0125_commerce_plan_period_grants')]

    initial = False

    operations = [
        ops.CreateModel(
            name='CommerceProviderPaymentProjection',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('application', fields.OneToOneField('models.CommerceProviderEventApplication', source_field='application_id', db_constraint=True, to_field='id', related_name='payment_projection', on_delete=OnDelete.RESTRICT)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='commerce_provider_payment_projections', on_delete=OnDelete.RESTRICT)),
                ('subscription', fields.ForeignKeyField('models.WorkspaceSubscription', source_field='subscription_id', db_constraint=True, to_field='id', related_name='provider_payment_projections', on_delete=OnDelete.RESTRICT)),
                ('plan_revision', fields.ForeignKeyField('models.CommercePlanRevision', source_field='plan_revision_id', db_constraint=True, to_field='id', related_name='provider_payment_projections', on_delete=OnDelete.RESTRICT)),
                ('invoice', fields.ForeignKeyField('models.CommerceInvoice', source_field='invoice_id', db_constraint=True, to_field='id', related_name='provider_event_projections', on_delete=OnDelete.RESTRICT)),
                ('provider', fields.CharField(max_length=32)),
                ('provider_mode', fields.CharEnumField(description='TEST: test\nLIVE: live', enum_type=BillingProviderMode, max_length=4)),
                ('provider_account_id', fields.CharField(max_length=255)),
                ('provider_event_id', fields.CharField(max_length=255)),
                ('provider_event_occurred_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ('payload_sha256', fields.CharField(max_length=64)),
                ('signature_reference', fields.CharField(max_length=255)),
                ('payment_fingerprint', fields.CharField(max_length=64)),
                ('invoice_status', fields.CharEnumField(description='OPEN: open\nPAID: paid\nVOID: void\nUNCOLLECTIBLE: uncollectible\nREFUNDED: refunded\nPARTIALLY_REFUNDED: partially_refunded', enum_type=CommerceInvoiceStatus, max_length=18)),
                ('amount_due_micros', fields.BigIntField()),
                ('amount_paid_micros', fields.BigIntField()),
                ('amount_refunded_micros', fields.BigIntField()),
                ('result_code', fields.CharField(max_length=64)),
            ],
            options={'table': 'commerce_provider_payment_projections', 'app': 'models', 'unique_together': (('provider', 'provider_mode', 'provider_account_id', 'provider_event_id'),), 'indexes': [Index(fields=['workspace_id', 'provider_event_occurred_at']), Index(fields=['invoice_id', 'provider_event_occurred_at'])], 'pk_attr': 'id', 'table_description': 'Immutable Provider event evidence for invoice and transaction projections.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='CommerceProviderPaymentTransactionProjection',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('payment_projection', fields.ForeignKeyField('models.CommerceProviderPaymentProjection', source_field='payment_projection_id', db_constraint=True, to_field='id', related_name='transaction_projections', on_delete=OnDelete.RESTRICT)),
                ('transaction', fields.ForeignKeyField('models.CommerceTransaction', source_field='transaction_id', db_constraint=True, to_field='id', related_name='provider_event_projections', on_delete=OnDelete.RESTRICT)),
                ('status', fields.CharEnumField(description='PENDING: pending\nSUCCEEDED: succeeded\nFAILED: failed\nCANCELED: canceled\nREFUNDED: refunded\nPARTIALLY_REFUNDED: partially_refunded', enum_type=CommerceTransactionStatus, max_length=18)),
                ('amount_micros', fields.BigIntField()),
                ('provider_event_occurred_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'commerce_provider_payment_transaction_projections', 'app': 'models', 'unique_together': (('payment_projection_id', 'transaction_id'),), 'indexes': [Index(fields=['transaction_id', 'provider_event_occurred_at'])], 'pk_attr': 'id', 'table_description': 'Immutable transaction snapshots for Provider payment applications.'},
            bases=['BaseModel'],
        ),
    ]
