from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from typing import Literal, Protocol, runtime_checkable
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from src.models.commerce.billing import BillingCycle, SubscriptionStatus
from src.models.commerce.payments import (
    CommerceInvoiceStatus,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)
from src.modules.commerce.subscription_transitions.schema import ProviderConfirmedTransitionEvidence


class BillingRedirectSession(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    url: str


class CheckoutSession(BillingRedirectSession):
    external_session_id: str = Field(..., min_length=1, max_length=255)
    provider_account_id: str = Field(..., min_length=1, max_length=255)
    expires_at: AwareDatetime


class ProviderDunningEvent(BaseModel):
    """Exact dunning fact normalized by a Connector from a signature-verified Provider event."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["payment_failure", "payment_recovered", "final_unpaid"]
    provider_period_id: str = Field(..., min_length=1, max_length=255)
    occurred_at: AwareDatetime
    recovery_deadline: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_recovery_deadline(self) -> ProviderDunningEvent:
        if self.kind == "payment_failure":
            if self.recovery_deadline is None or self.recovery_deadline <= self.occurred_at:
                raise ValueError("payment failure requires a later provider recovery deadline")
        elif self.recovery_deadline is not None:
            raise ValueError("only payment failure may carry a provider recovery deadline")
        return self


class ProviderCheckoutActivationEvidence(BaseModel):
    """Connector-normalized correlation to one completed subscription Checkout."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    checkout_session_id: UUID
    external_session_id: str = Field(..., min_length=1, max_length=255)
    checkout_outcome_event_id: str = Field(..., min_length=1, max_length=255)
    occurred_at: AwareDatetime


class ProviderTransactionProjection(BaseModel):
    """One sanitized Provider transaction linked to an invoice event."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    external_transaction_id: str = Field(..., min_length=1, max_length=255)
    kind: CommerceTransactionKind
    status: CommerceTransactionStatus
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(..., ge=0)
    occurred_at: AwareDatetime


class ProviderInvoiceProjection(BaseModel):
    """Current invoice facts and exact transaction links from one Provider event."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    external_invoice_id: str = Field(..., min_length=1, max_length=255)
    status: CommerceInvoiceStatus
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_due_micros: int = Field(..., ge=0)
    amount_paid_micros: int = Field(..., ge=0)
    amount_refunded_micros: int = Field(default=0, ge=0)
    period_start: AwareDatetime | None = None
    period_end: AwareDatetime | None = None
    hosted_invoice_url: str | None = Field(default=None, min_length=1)
    issued_at: AwareDatetime
    paid_at: AwareDatetime | None = None
    occurred_at: AwareDatetime
    transactions: tuple[ProviderTransactionProjection, ...] = ()

    @model_validator(mode="after")
    def validate_invoice_facts(self) -> ProviderInvoiceProjection:
        if (self.period_start is None) != (self.period_end is None):
            raise ValueError("invoice period boundaries must be both present or both absent")
        if self.period_start is not None and self.period_end is not None and self.period_end <= self.period_start:
            raise ValueError("invoice period end must be later than its start")
        if self.amount_paid_micros > self.amount_due_micros:
            raise ValueError("invoice paid amount cannot exceed amount due")
        if self.amount_refunded_micros > self.amount_paid_micros:
            raise ValueError("invoice refunded amount cannot exceed amount paid")
        if self.status == CommerceInvoiceStatus.PAID and self.paid_at is None:
            raise ValueError("paid invoice requires paid_at")
        if self.status == CommerceInvoiceStatus.OPEN and self.paid_at is not None:
            raise ValueError("open invoice cannot carry paid_at")
        transaction_ids = [transaction.external_transaction_id for transaction in self.transactions]
        if len(transaction_ids) != len(set(transaction_ids)):
            raise ValueError("invoice transaction identities must be unique")
        if any(transaction.currency != self.currency for transaction in self.transactions):
            raise ValueError("invoice and transaction currencies must match")
        return self


class ProviderSubscription(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str = Field(..., min_length=1, max_length=255)
    workspace_id: UUID
    plan_id: UUID
    plan_revision_id: UUID
    external_price_id: str = Field(..., min_length=1, max_length=255)
    billing_cycle: BillingCycle
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    customer_id: str = Field(..., min_length=1, max_length=128)
    subscription_id: str = Field(..., min_length=1, max_length=128)
    status: SubscriptionStatus
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool
    dunning_event: ProviderDunningEvent | None = None
    confirmed_transition: ProviderConfirmedTransitionEvidence | None = None
    checkout_activation: ProviderCheckoutActivationEvidence | None = None
    payment: ProviderInvoiceProjection | None = None

    @model_validator(mode="after")
    def validate_revision_authority(self) -> ProviderSubscription:
        if self.confirmed_transition is not None and self.checkout_activation is not None:
            raise ValueError("subscription event cannot carry multiple Revision authorities")
        if self.payment is None:
            return self
        if self.payment.currency != self.currency:
            raise ValueError("subscription and invoice currencies must match")
        if self.payment.period_start is None or self.payment.period_end is None:
            raise ValueError("subscription invoice requires exact period boundaries")
        if self.payment.period_start != self.current_period_start or self.payment.period_end != self.current_period_end:
            raise ValueError("invoice and subscription periods must match")
        if self.dunning_event is not None and self.dunning_event.provider_period_id != self.payment.external_invoice_id:
            raise ValueError("dunning period identity must match the invoice identity")
        expected_kind = (
            CommerceTransactionKind.SUBSCRIPTION
            if self.checkout_activation is not None
            else CommerceTransactionKind.RENEWAL
        )
        if any(transaction.kind != expected_kind for transaction in self.payment.transactions):
            raise ValueError("invoice transaction kind does not match the subscription lifecycle")
        return self


class ProviderCheckoutOutcome(BaseModel):
    """Exact Checkout outcome normalized from one signature-verified Provider event."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str = Field(..., min_length=1, max_length=255)
    checkout_session_id: UUID
    external_session_id: str = Field(..., min_length=1, max_length=255)
    workspace_id: UUID
    actor_user_id: UUID
    plan_code: str = Field(..., min_length=1, max_length=48)
    plan_revision_id: UUID
    external_price_id: str = Field(..., min_length=1, max_length=255)
    checkout_request_fingerprint: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    command_idempotency_key_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    expected_revision: int = Field(..., ge=1)
    outcome: Literal["pending", "succeeded", "failed", "canceled"]
    occurred_at: AwareDatetime


class BillingWebhookEnvelope(BaseModel):
    """Signature-verified identity extracted without provider-side I/O."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_event_id: str = Field(..., min_length=1, max_length=255)
    event_type: str = Field(..., min_length=1, max_length=160)
    provider_mode: Literal["test", "live"]
    provider_account_id: str = Field(..., min_length=1, max_length=255)
    signature_timestamp: AwareDatetime


def build_billing_operation_idempotency_key(
    *,
    operation: Literal["checkout", "portal"],
    business_identity: tuple[str, ...],
) -> str:
    if not business_identity or any(not component for component in business_identity):
        raise ValueError("billing operation idempotency identity must contain only non-empty components")
    digest = sha256("\0".join((operation, *business_identity)).encode()).hexdigest()
    return f"arclayer:{operation}:{digest}"


@runtime_checkable
class BillingConnector(Protocol):
    @property
    def provider_mode(self) -> str: ...

    async def create_checkout_session(
        self,
        *,
        workspace_id: str,
        plan_code: str,
        plan_id: str,
        plan_revision_id: str,
        external_price_id: str,
        billing_cycle: str,
        currency: str,
        success_url: str,
        cancel_url: str,
        customer_id: str | None,
        idempotency_key: str,
    ) -> CheckoutSession: ...

    async def create_portal_session(
        self,
        *,
        customer_id: str,
        return_url: str,
        idempotency_key: str,
    ) -> BillingRedirectSession: ...

    def verify_webhook(
        self,
        *,
        payload: bytes,
        signature: str,
    ) -> BillingWebhookEnvelope: ...

    async def subscription_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderSubscription | None: ...

    async def checkout_outcome_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderCheckoutOutcome | None: ...
