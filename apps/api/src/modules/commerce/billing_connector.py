from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from typing import Literal, Protocol, runtime_checkable
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from src.models.commerce.billing import BillingCycle, SubscriptionStatus
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
