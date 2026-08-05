from tortoise import migrations
from tortoise.migrations import operations as ops
from src.common.utils.ids import uuid7
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.credit_allocation import PlanPeriodGrantReason
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0124_commercial_access_fact_immutability')]

    initial = False

    operations = [
        ops.CreateModel(
            name='CommercePlanPeriodGrant',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('workspace', fields.ForeignKeyField('models.Workspace', source_field='workspace_id', db_constraint=True, to_field='id', related_name='commerce_plan_period_grants', on_delete=OnDelete.RESTRICT)),
                ('account', fields.ForeignKeyField('models.WorkspaceCreditAccount', source_field='account_id', db_constraint=True, to_field='id', related_name='period_grants', on_delete=OnDelete.RESTRICT)),
                ('subscription', fields.ForeignKeyField('models.WorkspaceSubscription', source_field='subscription_id', db_constraint=True, to_field='id', related_name='period_grants', on_delete=OnDelete.RESTRICT)),
                ('plan_revision', fields.ForeignKeyField('models.CommercePlanRevision', source_field='plan_revision_id', db_constraint=True, to_field='id', related_name='period_grants', on_delete=OnDelete.RESTRICT)),
                ('application', fields.OneToOneField('models.CommerceProviderEventApplication', source_field='application_id', db_constraint=True, to_field='id', related_name='period_credit_grant', on_delete=OnDelete.RESTRICT)),
                ('ledger_entry', fields.OneToOneField('models.WorkspaceCreditLedger', source_field='ledger_entry_id', db_constraint=True, to_field='id', related_name='period_grant_receipt', on_delete=OnDelete.RESTRICT)),
                ('grant_lot', fields.OneToOneField('models.WorkspaceCreditGrantLot', source_field='grant_lot_id', null=True, db_constraint=True, to_field='id', related_name='period_grant_receipt', on_delete=OnDelete.RESTRICT)),
                ('grant_identity', fields.CharField(unique=True, max_length=160)),
                ('reason', fields.CharEnumField(description='ACTIVATION: activation\nRENEWAL: renewal\nRECOVERY: recovery', enum_type=PlanPeriodGrantReason, max_length=10)),
                ('provider', fields.CharField(max_length=32)),
                ('provider_mode', fields.CharEnumField(description='TEST: test\nLIVE: live', enum_type=BillingProviderMode, max_length=4)),
                ('provider_account_id', fields.CharField(max_length=255)),
                ('provider_event_id', fields.CharField(max_length=255)),
                ('provider_period_identity', fields.CharField(max_length=255)),
                ('period_start', fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ('period_end', fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ('granted_credits', fields.BigIntField()),
            ],
            options={'table': 'commerce_plan_period_grants', 'app': 'models', 'indexes': [Index(fields=['workspace_id', 'period_start', 'period_end']), Index(fields=['provider', 'provider_mode', 'provider_account_id', 'provider_period_identity'])], 'pk_attr': 'id', 'table_description': 'Exact Provider period and Revision evidence for Plan Credit grants.'},
            bases=['BaseModel'],
        ),
    ]
