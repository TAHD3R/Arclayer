from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import CommerceCheckoutOutcome, CommerceCheckoutStatus


class Migration(migrations.Migration):
    dependencies = [("models", "0127_top_up_checkout_snapshot_evidence")]

    initial = False

    operations = [
        ops.CreateModel(
            name="CommerceTopUpSettlementApplication",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "workspace",
                    fields.ForeignKeyField(
                        "models.Workspace",
                        source_field="workspace_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="commerce_top_up_settlement_applications",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "checkout_session",
                    fields.ForeignKeyField(
                        "models.CommerceCheckoutSession",
                        source_field="checkout_session_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="top_up_settlement_applications",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "granted_checkout_session",
                    fields.OneToOneField(
                        "models.CommerceCheckoutSession",
                        source_field="granted_checkout_session_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="top_up_credit_grant_application",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "outcome_command",
                    fields.OneToOneField(
                        "models.CommerceCheckoutOutcomeCommand",
                        source_field="outcome_command_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="top_up_settlement_application",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "transaction",
                    fields.OneToOneField(
                        "models.CommerceTransaction",
                        source_field="transaction_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="top_up_settlement_application",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "invoice",
                    fields.OneToOneField(
                        "models.CommerceInvoice",
                        source_field="invoice_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="top_up_settlement_application",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "ledger_entry",
                    fields.OneToOneField(
                        "models.WorkspaceCreditLedger",
                        source_field="ledger_entry_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="top_up_settlement_application",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "grant_lot",
                    fields.OneToOneField(
                        "models.WorkspaceCreditGrantLot",
                        source_field="grant_lot_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="top_up_settlement_application",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                ("provider", fields.CharField(max_length=32)),
                (
                    "provider_mode",
                    fields.CharEnumField(
                        description="TEST: test\nLIVE: live",
                        enum_type=BillingProviderMode,
                        max_length=4,
                    ),
                ),
                ("provider_account_id", fields.CharField(max_length=255)),
                ("provider_event_id", fields.CharField(max_length=255)),
                (
                    "outcome",
                    fields.CharEnumField(
                        db_index=True,
                        description="PENDING: pending\nSUCCEEDED: succeeded\nFAILED: failed\nCANCELED: canceled",
                        enum_type=CommerceCheckoutOutcome,
                        max_length=9,
                    ),
                ),
                ("top_up_offer_id_snapshot", fields.UUIDField()),
                ("top_up_offer_revision", fields.BigIntField()),
                ("external_price_id", fields.CharField(max_length=255)),
                ("checkout_request_fingerprint", fields.CharField(max_length=64)),
                ("currency", fields.CharField(max_length=3)),
                ("amount_micros", fields.BigIntField()),
                ("credit_amount", fields.BigIntField()),
                ("external_transaction_id", fields.CharField(max_length=255)),
                ("external_invoice_id", fields.CharField(null=True, max_length=255)),
                ("provider_event_occurred_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ("payload_sha256", fields.CharField(max_length=64)),
                ("signature_reference", fields.CharField(max_length=255)),
                ("settlement_fingerprint", fields.CharField(max_length=64)),
                (
                    "result_status",
                    fields.CharEnumField(
                        description="PENDING: pending\nCOMPLETED: completed\nFAILED: failed\nCANCELED: canceled\nEXPIRED: expired",
                        enum_type=CommerceCheckoutStatus,
                        max_length=9,
                    ),
                ),
                ("result_revision", fields.BigIntField()),
                ("applied_at", fields.DatetimeField(auto_now=False, auto_now_add=False)),
            ],
            options={
                "table": "commerce_top_up_settlement_applications",
                "app": "models",
                "unique_together": (("provider", "provider_mode", "provider_account_id", "provider_event_id"),),
                "indexes": [
                    Index(fields=["workspace_id", "provider_event_occurred_at"]),
                    Index(fields=["checkout_session_id", "provider_event_occurred_at"]),
                ],
                "pk_attr": "id",
                "table_description": "Exact signed top-up settlement application and Credit grant evidence.",
            },
            bases=["BaseModel"],
        ),
    ]
