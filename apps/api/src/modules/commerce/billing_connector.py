from __future__ import annotations

from datetime import datetime
from typing import Literal, Protocol, runtime_checkable
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from src.models.commerce.billing import BillingCycle, SubscriptionStatus


class CheckoutSession(BaseModel):
    model_config = ConfigDict(frozen=True)

    url: str


class ProviderSubscription(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str = Field(..., min_length=1, max_length=255)
    workspace_id: UUID
    plan_code: str = Field(..., min_length=1, max_length=48)
    billing_cycle: BillingCycle
    customer_id: str = Field(..., min_length=1, max_length=128)
    subscription_id: str = Field(..., min_length=1, max_length=128)
    status: SubscriptionStatus
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool


class BillingWebhookEnvelope(BaseModel):
    """Signature-verified identity extracted without provider-side I/O."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider_event_id: str = Field(..., min_length=1, max_length=255)
    event_type: str = Field(..., min_length=1, max_length=160)
    provider_mode: Literal["test", "live"]
    provider_account_id: str = Field(..., min_length=1, max_length=255)
    signature_timestamp: AwareDatetime


@runtime_checkable
class BillingConnector(Protocol):
    async def create_checkout_session(
        self,
        *,
        workspace_id: str,
        plan_code: str,
        plan_name: str,
        billing_cycle: str,
        currency: str,
        amount_micros: int,
        success_url: str,
        cancel_url: str,
        customer_id: str | None,
    ) -> CheckoutSession: ...

    async def create_portal_session(self, *, customer_id: str, return_url: str) -> CheckoutSession: ...

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
