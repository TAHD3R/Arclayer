from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class CommercePlanTier(StrEnum):
    FREE = "free"
    PREMIUM = "premium"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(StrEnum):
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"


class BillingCycle(StrEnum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class BillingProviderMode(StrEnum):
    TEST = "test"
    LIVE = "live"


class ConnectorEventInboxStatus(StrEnum):
    RECEIVED = "received"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"


class CreditRefreshInterval(StrEnum):
    DAILY = "daily"
    MONTHLY = "monthly"
    YEARLY = "yearly"
    NONE = "none"


class SubscriptionChangeRequestStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELED = "canceled"


class CreditLedgerEntryType(StrEnum):
    PERIOD_GRANT = "period_grant"
    RESERVATION = "reservation"
    COMMIT = "commit"
    RELEASE = "release"
    ADJUSTMENT = "adjustment"
    EXPIRATION = "expiration"


class CommercePlan(BaseModel):
    """Configurable platform plan catalog entry."""

    code = fields.CharField(max_length=48, unique=True, db_index=True)
    tier = fields.CharEnumField(CommercePlanTier, db_index=True)
    name = fields.CharField(max_length=96)
    description = fields.CharField(max_length=512)
    name_i18n_key = fields.CharField(max_length=128, null=True)
    description_i18n_key = fields.CharField(max_length=128, null=True)
    credit_grant_amount = fields.BigIntField()
    credit_refresh_interval = fields.CharEnumField(CreditRefreshInterval, default=CreditRefreshInterval.MONTHLY)
    credit_value_micros = fields.BigIntField(default=1_000)
    price_monthly_micros = fields.BigIntField(default=0)
    price_yearly_micros = fields.BigIntField(default=0)
    currency = fields.CharField(max_length=3, default="USD")
    features = fields.JSONField(default=list)
    is_active = fields.BooleanField(default=True, db_index=True)
    is_default = fields.BooleanField(default=False, db_index=True)
    sort_order = fields.IntField(default=100, db_index=True)

    class Meta(BaseModel.Meta):
        table = "commerce_plans"
        table_description = "Configurable workspace subscription plan catalog."
        abstract = False


class WorkspaceSubscription(BaseModel):
    """Current commercial subscription state for one workspace."""

    workspace = fields.OneToOneField(
        "models.Workspace",
        related_name="commerce_subscription",
        on_delete=fields.CASCADE,
    )
    plan = fields.ForeignKeyField(
        "models.CommercePlan",
        related_name="workspace_subscriptions",
        on_delete=fields.RESTRICT,
    )
    status = fields.CharEnumField(SubscriptionStatus, default=SubscriptionStatus.ACTIVE, db_index=True)
    billing_cycle = fields.CharEnumField(BillingCycle, default=BillingCycle.MONTHLY)
    current_period_start = fields.DatetimeField()
    current_period_end = fields.DatetimeField(db_index=True)
    cancel_at_period_end = fields.BooleanField(default=False)
    billing_provider = fields.CharField(max_length=32, default="manual")
    external_customer_id = fields.CharField(max_length=128, null=True, db_index=True)
    external_subscription_id = fields.CharField(max_length=128, null=True, unique=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        plan_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_subscriptions"
        table_description = "Workspace subscription lifecycle state."
        abstract = False


class BillingProviderEventReceipt(BaseModel):
    """Durable claim proving that one external billing event was applied once."""

    provider = fields.CharField(max_length=32)
    event_id = fields.CharField(max_length=255)
    workspace_id = fields.UUIDField(db_index=True)

    class Meta(BaseModel.Meta):
        table = "commerce_billing_provider_event_receipts"
        table_description = "Idempotency receipts for signed external billing events."
        abstract = False
        unique_together = (("provider", "event_id"),)
        indexes = (("workspace_id", "created_at"),)


class ConnectorEventInbox(BaseModel):
    """Encrypted raw Connector event accepted before asynchronous processing."""

    provider = fields.CharField(max_length=32)
    provider_mode = fields.CharEnumField(BillingProviderMode, max_length=8)
    provider_account_id = fields.CharField(max_length=255)
    provider_event_id = fields.CharField(max_length=255)
    connector_key = fields.CharField(max_length=128)
    connector_version = fields.CharField(max_length=64)
    event_type = fields.CharField(max_length=160, db_index=True)
    signature_timestamp = fields.DatetimeField()
    payload_sha256 = fields.CharField(max_length=64)
    encrypted_payload = fields.TextField()
    retention_deadline = fields.DatetimeField(db_index=True)
    status = fields.CharEnumField(
        ConnectorEventInboxStatus,
        max_length=16,
        default=ConnectorEventInboxStatus.RECEIVED,
        db_index=True,
    )
    processing_attempts = fields.IntField(default=0)
    job_id = fields.UUIDField(null=True, unique=True)
    processed_at = fields.DatetimeField(null=True)
    last_error_code = fields.CharField(max_length=96, null=True)
    last_error_message = fields.TextField(null=True)
    result_reference = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "connector_event_inbox"
        table_description = "Encrypted raw Connector events and durable processing authority."
        abstract = False
        unique_together = (("provider", "provider_mode", "provider_account_id", "provider_event_id"),)
        indexes = (
            ("status", "created_at"),
            ("connector_key", "connector_version", "created_at"),
        )


class WorkspaceCreditAccount(BaseModel):
    """Transactional credit balance cache for a workspace."""

    workspace = fields.OneToOneField(
        "models.Workspace",
        related_name="credit_account",
        on_delete=fields.CASCADE,
    )
    subscription = fields.OneToOneField(
        "models.WorkspaceSubscription",
        related_name="credit_account",
        on_delete=fields.CASCADE,
    )
    balance_credits = fields.BigIntField(default=0)
    reserved_credits = fields.BigIntField(default=0)
    lifetime_granted_credits = fields.BigIntField(default=0)
    lifetime_spent_credits = fields.BigIntField(default=0)
    period_granted_credits = fields.BigIntField(default=0)
    period_spent_credits = fields.BigIntField(default=0)
    period_start = fields.DatetimeField()
    period_end = fields.DatetimeField(db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        subscription_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_credit_accounts"
        table_description = "Workspace AI credit balance and reservation counters."
        abstract = False


class WorkspaceCreditLedger(BaseModel):
    """Append-only credit ledger; entries are never edited or deleted by services."""

    workspace_id = fields.UUIDField(db_index=True)
    account_id = fields.UUIDField(db_index=True)
    entry_type = fields.CharEnumField(CreditLedgerEntryType, db_index=True)
    delta_balance_credits = fields.BigIntField()
    delta_reserved_credits = fields.BigIntField()
    balance_after_credits = fields.BigIntField()
    reserved_after_credits = fields.BigIntField()
    reference_type = fields.CharField(max_length=48)
    reference_id = fields.UUIDField(null=True, db_index=True)
    idempotency_key = fields.CharField(max_length=160, unique=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    description_key = fields.CharField(max_length=128)
    details = fields.JSONField(default=dict)

    class Meta(BaseModel.Meta):
        table = "commerce_workspace_credit_ledger"
        table_description = "Immutable workspace credit balance ledger."
        abstract = False
        indexes = (("workspace_id", "created_at"), ("account_id", "created_at"))


class WorkspaceSubscriptionChangeRequest(BaseModel):
    """Operator-managed workspace plan change request."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="subscription_change_requests",
        on_delete=fields.CASCADE,
    )
    requested_plan = fields.ForeignKeyField(
        "models.CommercePlan",
        related_name="subscription_change_requests",
        on_delete=fields.RESTRICT,
    )
    requested_by_user_id = fields.UUIDField(db_index=True)
    billing_cycle = fields.CharEnumField(BillingCycle)
    reason = fields.CharField(max_length=1000, null=True)
    status = fields.CharEnumField(
        SubscriptionChangeRequestStatus,
        default=SubscriptionChangeRequestStatus.PENDING,
        db_index=True,
    )
    reviewed_by_user_id = fields.UUIDField(null=True, db_index=True)
    reviewed_at = fields.DatetimeField(null=True)
    review_note = fields.CharField(max_length=1000, null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        requested_plan_id: UUID

    class Meta(BaseModel.Meta):
        table = "commerce_subscription_change_requests"
        table_description = "Operator-managed workspace subscription change requests."
        abstract = False
        indexes = (("workspace_id", "status", "created_at"), ("status", "created_at"))
