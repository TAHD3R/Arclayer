from __future__ import annotations

from typing import TYPE_CHECKING, Literal
from uuid import UUID

from pydantic import AwareDatetime, ConfigDict, Field

from src.common.schemas import BaseSchema
from src.modules.commerce.top_up_checkout_repository import TopUpCheckoutSessionRecord

if TYPE_CHECKING:
    from src.modules.commerce.billing_provider_application_service import VerifiedBillingProviderEvent


class ProviderTopUpSettlement(BaseSchema):
    """Exact top-up payment facts normalized from one signature-verified Provider event."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: str = Field(..., min_length=1, max_length=255)
    checkout_session_id: UUID | None = None
    external_session_id: str = Field(..., min_length=1, max_length=255)
    workspace_id: UUID | None = None
    actor_user_id: UUID | None = None
    top_up_offer_id: UUID | None = None
    top_up_offer_revision: int = Field(..., ge=1)
    external_price_id: str = Field(..., min_length=1, max_length=255)
    checkout_request_fingerprint: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    outcome: Literal["pending", "succeeded", "failed", "canceled"]
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(..., gt=0)
    credit_amount: int = Field(..., gt=0)
    external_transaction_id: str = Field(..., min_length=1, max_length=255)
    external_invoice_id: str | None = Field(default=None, min_length=1, max_length=255)
    occurred_at: AwareDatetime


def validate_top_up_settlement_evidence(
    *,
    checkout: TopUpCheckoutSessionRecord,
    settlement: ProviderTopUpSettlement,
    provider: str,
    provider_mode: str,
    provider_account_id: str,
    verified_event: VerifiedBillingProviderEvent,
) -> None:
    expected = (
        settlement.event_id == verified_event.provider_event_id,
        provider == checkout.provider,
        provider_mode == str(checkout.provider_mode),
        provider_account_id == checkout.provider_account_id,
        settlement.checkout_session_id == checkout.id,
        settlement.external_session_id == checkout.external_session_id,
        settlement.workspace_id == checkout.workspace_id,
        settlement.actor_user_id == checkout.actor_user_id,
        settlement.top_up_offer_id == checkout.top_up_offer_id,
        settlement.top_up_offer_revision == checkout.top_up_offer_revision,
        settlement.external_price_id == checkout.external_price_id,
        settlement.checkout_request_fingerprint == checkout.request_fingerprint,
        settlement.currency == checkout.currency,
        settlement.amount_micros == checkout.amount_micros,
        settlement.credit_amount == checkout.credit_amount,
        settlement.occurred_at <= checkout.expires_at,
    )
    if not all(expected):
        raise ValueError("top-up settlement evidence does not match the immutable Checkout snapshot")
