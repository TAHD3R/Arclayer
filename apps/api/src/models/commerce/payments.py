from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel
from src.models.commerce.billing import BillingCycle, BillingProviderMode


class CommerceCheckoutKind(StrEnum):
    SUBSCRIPTION = "subscription"
    TOP_UP = "top_up"


class CommerceCheckoutStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"
    EXPIRED = "expired"


class CommerceTransactionKind(StrEnum):
    SUBSCRIPTION = "subscription"
    RENEWAL = "renewal"
    TOP_UP = "top_up"
    REFUND = "refund"


class CommerceTransactionStatus(StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"


class CommerceInvoiceStatus(StrEnum):
    OPEN = "open"
    PAID = "paid"
    VOID = "void"
    UNCOLLECTIBLE = "uncollectible"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"


class CommerceRefundStatus(StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"


class CommerceCreditTopUpOffer(BaseModel):
    """Stable operator-managed Credit top-up product identity."""

    code = fields.CharField(max_length=48, unique=True, db_index=True)
    credit_amount = fields.BigIntField()
    name_i18n_key = fields.CharField(max_length=128)
    description_i18n_key = fields.CharField(max_length=128)
    is_active = fields.BooleanField(default=True, db_index=True)
    sort_order = fields.IntField(default=100, db_index=True)
    revision = fields.BigIntField(default=1)

    class Meta(BaseModel.Meta):
        table = "commerce_credit_top_up_offers"
        table_description = "Stable Credit top-up offer identities."
        abstract = False


class CommerceCreditTopUpOfferPrice(BaseModel):
    """Provider-specific price mapping for one Credit top-up offer."""

    offer = fields.ForeignKeyField("models.CommerceCreditTopUpOffer", related_name="prices", on_delete=fields.CASCADE)
    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode)
    currency = fields.CharField(max_length=3)
    amount_micros = fields.BigIntField()
    external_price_id = fields.CharField(max_length=255)

    if TYPE_CHECKING:
        offer_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_credit_top_up_offer_prices"
        table_description = "Provider Price mappings for Credit top-up offers."
        abstract = False
        unique_together = (("offer_id", "provider", "provider_mode", "currency"),)
        indexes = (("provider", "provider_mode", "external_price_id"),)


class CommerceCheckoutSession(BaseModel):
    """Durable checkout authority for subscription or top-up purchase."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="commerce_checkout_sessions", on_delete=fields.RESTRICT
    )
    subscription = fields.ForeignKeyField(
        "models.WorkspaceSubscription",
        related_name="checkout_sessions",
        on_delete=fields.RESTRICT,
        null=True,
    )
    target_plan_revision = fields.ForeignKeyField(
        "models.CommercePlanRevision",
        related_name="checkout_sessions",
        on_delete=fields.RESTRICT,
        null=True,
    )
    top_up_offer = fields.ForeignKeyField(
        "models.CommerceCreditTopUpOffer",
        related_name="checkout_sessions",
        on_delete=fields.RESTRICT,
        null=True,
    )
    plan_code = fields.CharField(max_length=48, null=True)
    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode)
    provider_account_id = fields.CharField(max_length=255)
    kind = fields.CharEnumField(CommerceCheckoutKind, db_index=True)
    status = fields.CharEnumField(
        CommerceCheckoutStatus,
        default=CommerceCheckoutStatus.PENDING,
        db_index=True,
    )
    billing_cycle = fields.CharEnumField(BillingCycle, null=True)
    currency = fields.CharField(max_length=3)
    amount_micros = fields.BigIntField()
    credit_amount = fields.BigIntField(null=True)
    external_price_id = fields.CharField(max_length=255)
    external_session_id = fields.CharField(max_length=255, unique=True)
    checkout_url = fields.TextField()
    idempotency_key = fields.CharField(max_length=160, unique=True)
    request_fingerprint = fields.CharField(max_length=64)
    actor_user_id = fields.UUIDField(db_index=True)
    expires_at = fields.DatetimeField(db_index=True)
    completed_at = fields.DatetimeField(null=True)
    revision = fields.BigIntField(default=1)

    if TYPE_CHECKING:
        workspace_id: UUID
        subscription_id: UUID | None
        target_plan_revision_id: UUID | None
        top_up_offer_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "commerce_checkout_sessions"
        table_description = "Durable subscription and top-up checkout sessions."
        abstract = False
        indexes = (
            ("workspace_id", "created_at"),
            ("provider", "provider_mode", "provider_account_id", "status"),
        )


class CommerceInvoice(BaseModel):
    """Provider-backed invoice projection without payment credentials."""

    workspace = fields.ForeignKeyField("models.Workspace", related_name="commerce_invoices", on_delete=fields.RESTRICT)
    subscription = fields.ForeignKeyField(
        "models.WorkspaceSubscription",
        related_name="invoices",
        on_delete=fields.RESTRICT,
        null=True,
    )
    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode)
    external_invoice_id = fields.CharField(max_length=255)
    status = fields.CharEnumField(CommerceInvoiceStatus, db_index=True)
    currency = fields.CharField(max_length=3)
    amount_due_micros = fields.BigIntField()
    amount_paid_micros = fields.BigIntField(default=0)
    amount_refunded_micros = fields.BigIntField(default=0)
    period_start = fields.DatetimeField(null=True)
    period_end = fields.DatetimeField(null=True)
    hosted_invoice_url = fields.TextField(null=True)
    issued_at = fields.DatetimeField(db_index=True)
    paid_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        subscription_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "commerce_invoices"
        table_description = "Sanitized Provider invoice projections."
        abstract = False
        unique_together = (("provider", "provider_mode", "external_invoice_id"),)
        indexes = (("workspace_id", "issued_at"), ("status", "issued_at"))


class CommerceTransaction(BaseModel):
    """Provider payment, renewal, top-up, or refund transaction projection."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="commerce_transactions", on_delete=fields.RESTRICT
    )
    subscription = fields.ForeignKeyField(
        "models.WorkspaceSubscription",
        related_name="transactions",
        on_delete=fields.RESTRICT,
        null=True,
    )
    checkout_session = fields.ForeignKeyField(
        "models.CommerceCheckoutSession",
        related_name="transactions",
        on_delete=fields.RESTRICT,
        null=True,
    )
    invoice = fields.ForeignKeyField(
        "models.CommerceInvoice",
        related_name="transactions",
        on_delete=fields.RESTRICT,
        null=True,
    )
    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode)
    external_transaction_id = fields.CharField(max_length=255)
    kind = fields.CharEnumField(CommerceTransactionKind, db_index=True)
    status = fields.CharEnumField(CommerceTransactionStatus, db_index=True)
    currency = fields.CharField(max_length=3)
    amount_micros = fields.BigIntField()
    credit_amount = fields.BigIntField(null=True)
    occurred_at = fields.DatetimeField(db_index=True)
    provider_event_id = fields.CharField(max_length=255, null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        subscription_id: UUID | None
        checkout_session_id: UUID | None
        invoice_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "commerce_transactions"
        table_description = "Sanitized Provider transaction projections."
        abstract = False
        unique_together = (("provider", "provider_mode", "external_transaction_id"),)
        indexes = (("workspace_id", "occurred_at"), ("status", "occurred_at"))


class CommerceRefund(BaseModel):
    """Idempotent refund request and Provider-confirmed outcome."""

    transaction = fields.ForeignKeyField(
        "models.CommerceTransaction", related_name="refunds", on_delete=fields.RESTRICT
    )
    status = fields.CharEnumField(
        CommerceRefundStatus,
        default=CommerceRefundStatus.PENDING,
        db_index=True,
    )
    amount_micros = fields.BigIntField()
    credit_amount = fields.BigIntField(null=True)
    reason = fields.TextField()
    actor_user_id = fields.UUIDField(db_index=True)
    idempotency_key = fields.CharField(max_length=160, unique=True)
    external_refund_id = fields.CharField(max_length=255, null=True, unique=True)
    provider_event_id = fields.CharField(max_length=255, null=True, db_index=True)
    completed_at = fields.DatetimeField(null=True)
    failure_code = fields.CharField(max_length=96, null=True)

    if TYPE_CHECKING:
        transaction_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_refunds"
        table_description = "Refund request authority and Provider-confirmed outcomes."
        abstract = False
        indexes = (("transaction_id", "created_at"), ("status", "created_at"))


class WorkspaceAutoRefillPolicy(BaseModel):
    """Workspace top-up automation with an explicit monthly monetary ceiling."""

    workspace = fields.OneToOneField("models.Workspace", related_name="auto_refill_policy", on_delete=fields.CASCADE)
    offer = fields.ForeignKeyField(
        "models.CommerceCreditTopUpOffer", related_name="auto_refill_policies", on_delete=fields.RESTRICT
    )
    is_enabled = fields.BooleanField(default=False, db_index=True)
    trigger_below_credits = fields.BigIntField()
    monthly_ceiling_micros = fields.BigIntField()
    currency = fields.CharField(max_length=3)
    revision = fields.BigIntField(default=1)
    updated_by_user_id = fields.UUIDField(db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        offer_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_auto_refill_policies"
        table_description = "Workspace automatic top-up policy with a monetary ceiling."
        abstract = False
