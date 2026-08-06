from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import CommerceCheckoutStatus
from src.modules.commerce.billing_provider_application_service import VerifiedBillingProviderEvent
from src.modules.commerce.top_up_checkout_repository import TopUpCheckoutSessionRecord
from src.modules.commerce.top_up_settlement_evidence import (
    ProviderTopUpSettlement,
    validate_top_up_settlement_evidence,
)


def _checkout() -> TopUpCheckoutSessionRecord:
    return TopUpCheckoutSessionRecord(
        id=uuid4(),
        workspace_id=uuid4(),
        top_up_offer_id=uuid4(),
        top_up_offer_revision=4,
        credit_amount=2_000,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        status=CommerceCheckoutStatus.PENDING,
        currency="USD",
        amount_micros=20_000_000,
        external_price_id="sim_price_credits_2000",
        external_session_id="sim_top_up_checkout",
        checkout_url="https://app.example.test/?billingProvider=simulated",
        idempotency_key="arclayer:top-up-checkout:" + "a" * 64,
        request_fingerprint="b" * 64,
        actor_user_id=uuid4(),
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
        revision=1,
    )


def _settlement(checkout: TopUpCheckoutSessionRecord) -> ProviderTopUpSettlement:
    return ProviderTopUpSettlement(
        event_id="sim_evt_top_up_paid",
        checkout_session_id=checkout.id,
        external_session_id=checkout.external_session_id,
        workspace_id=checkout.workspace_id,
        actor_user_id=checkout.actor_user_id,
        top_up_offer_id=checkout.top_up_offer_id,
        top_up_offer_revision=checkout.top_up_offer_revision,
        external_price_id=checkout.external_price_id,
        checkout_request_fingerprint=checkout.request_fingerprint,
        outcome="succeeded",
        currency=checkout.currency,
        amount_micros=checkout.amount_micros,
        credit_amount=checkout.credit_amount,
        external_transaction_id="sim_txn_top_up_paid",
        external_invoice_id="sim_invoice_top_up_paid",
        occurred_at=checkout.expires_at - timedelta(minutes=1),
    )


def _verified(settlement: ProviderTopUpSettlement) -> VerifiedBillingProviderEvent:
    return VerifiedBillingProviderEvent(
        provider_event_id=settlement.event_id,
        payload_sha256="c" * 64,
        signature_reference="billing-webhook:" + "d" * 64,
    )


def test_top_up_settlement_requires_exact_checkout_snapshot_and_provider_identity() -> None:
    checkout = _checkout()
    settlement = _settlement(checkout)

    validate_top_up_settlement_evidence(
        checkout=checkout,
        settlement=settlement,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        verified_event=_verified(settlement),
    )

    mismatches = (
        settlement.model_copy(update={"amount_micros": settlement.amount_micros + 1}),
        settlement.model_copy(update={"credit_amount": settlement.credit_amount + 1}),
        settlement.model_copy(update={"top_up_offer_revision": settlement.top_up_offer_revision + 1}),
        settlement.model_copy(update={"occurred_at": checkout.expires_at + timedelta(seconds=1)}),
    )
    for mismatch in mismatches:
        with pytest.raises(ValueError, match="immutable Checkout snapshot"):
            validate_top_up_settlement_evidence(
                checkout=checkout,
                settlement=mismatch,
                provider="simulated",
                provider_mode="test",
                provider_account_id="platform",
                verified_event=_verified(mismatch),
            )


def test_top_up_settlement_rejects_non_positive_money_or_credits() -> None:
    checkout = _checkout()
    payload = _settlement(checkout).model_dump()

    for field in ("amount_micros", "credit_amount"):
        with pytest.raises(ValidationError):
            ProviderTopUpSettlement.model_validate(payload | {field: 0})
