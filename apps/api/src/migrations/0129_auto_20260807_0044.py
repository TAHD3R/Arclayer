from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceInvoiceStatus,
    CommercePaymentCorrectionDisposition,
    CommerceRefundStatus,
    CommerceTransactionStatus,
)


class Migration(migrations.Migration):
    dependencies = [("models", "0128_top_up_settlement_applications")]

    initial = False

    operations = [
        ops.CreateModel(
            name="CommercePaymentCorrection",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "workspace",
                    fields.ForeignKeyField(
                        "models.Workspace",
                        source_field="workspace_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="commerce_payment_corrections",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "transaction",
                    fields.ForeignKeyField(
                        "models.CommerceTransaction",
                        source_field="transaction_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="payment_corrections",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "invoice",
                    fields.ForeignKeyField(
                        "models.CommerceInvoice",
                        source_field="invoice_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="payment_corrections",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "refund",
                    fields.ForeignKeyField(
                        "models.CommerceRefund",
                        source_field="refund_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="payment_corrections",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                ("provider", fields.CharField(max_length=32)),
                (
                    "provider_mode",
                    fields.CharEnumField(
                        description="TEST: test\nLIVE: live", enum_type=BillingProviderMode, max_length=4
                    ),
                ),
                ("provider_account_id", fields.CharField(max_length=255)),
                ("provider_event_id", fields.CharField(max_length=255)),
                ("external_transaction_id", fields.CharField(max_length=255)),
                ("external_invoice_id", fields.CharField(null=True, max_length=255)),
                ("external_refund_id", fields.CharField(null=True, max_length=255)),
                (
                    "transaction_status",
                    fields.CharEnumField(
                        description="PENDING: pending\nSUCCEEDED: succeeded\nFAILED: failed\nCANCELED: canceled\nREFUNDED: refunded\nPARTIALLY_REFUNDED: partially_refunded",
                        enum_type=CommerceTransactionStatus,
                        max_length=18,
                    ),
                ),
                (
                    "invoice_status",
                    fields.CharEnumField(
                        null=True,
                        description="OPEN: open\nPAID: paid\nVOID: void\nUNCOLLECTIBLE: uncollectible\nREFUNDED: refunded\nPARTIALLY_REFUNDED: partially_refunded",
                        enum_type=CommerceInvoiceStatus,
                        max_length=18,
                    ),
                ),
                (
                    "refund_status",
                    fields.CharEnumField(
                        null=True,
                        description="PENDING: pending\nSUCCEEDED: succeeded\nFAILED: failed\nCANCELED: canceled",
                        enum_type=CommerceRefundStatus,
                        max_length=9,
                    ),
                ),
                ("currency", fields.CharField(max_length=3)),
                ("amount_micros", fields.BigIntField()),
                ("amount_refunded_micros", fields.BigIntField(default=0)),
                ("credit_consequence", fields.BigIntField(null=True)),
                ("provider_event_occurred_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=False)),
                ("actor_user_id", fields.UUIDField(db_index=True)),
                ("reason", fields.TextField(unique=False)),
                ("evidence_reference", fields.CharField(max_length=255)),
                ("idempotency_key", fields.CharField(unique=True, max_length=160)),
                ("request_fingerprint", fields.CharField(max_length=64)),
                (
                    "disposition",
                    fields.CharEnumField(
                        db_index=True,
                        description="APPLIED: applied\nREPLAYED: replayed\nRECONCILIATION_REQUIRED: reconciliation_required",
                        enum_type=CommercePaymentCorrectionDisposition,
                        max_length=23,
                    ),
                ),
                ("failure_code", fields.CharField(null=True, max_length=96)),
            ],
            options={
                "table": "commerce_payment_corrections",
                "app": "models",
                "unique_together": (("provider", "provider_mode", "provider_account_id", "provider_event_id"),),
                "indexes": [
                    Index(fields=["workspace_id", "created_at"]),
                    Index(fields=["external_transaction_id", "created_at"]),
                ],
                "pk_attr": "id",
                "table_description": "Immutable Provider payment correction and reconciliation evidence.",
            },
            bases=["BaseModel"],
        ),
    ]
