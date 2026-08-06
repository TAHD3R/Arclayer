"""Official trusted Stripe billing Connector."""

import hashlib
import hmac
import json
import re
import time
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from src.config import get_settings
from src.core.connectors import (
    ConnectorAdminMetadata,
    ConnectorDefinition,
    ConnectorKind,
    ConnectorTrustLevel,
)
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.logging import get_logger
from src.core.registries import PluginRegistry
from src.models.commerce.billing import BillingCycle, SubscriptionStatus
from src.models.commerce.payments import (
    CommerceInvoiceStatus,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)
from src.modules.commerce.billing_connector import (
    BillingRedirectSession,
    BillingWebhookEnvelope,
    CheckoutSession,
    ProviderCheckoutOutcome,
    ProviderDunningEvent,
    ProviderInvoiceProjection,
    ProviderRefund,
    ProviderRefundOutcome,
    ProviderSubscription,
    ProviderTransactionProjection,
)
from src.modules.commerce.subscription_transitions.schema import (
    ProviderConfirmedTransitionEvidence,
    RenewalTransitionPreview,
)
from src.modules.commerce.top_up_settlement_evidence import ProviderTopUpSettlement

logger = get_logger(__name__)

_CONNECTOR_KEY = "billing.stripe"
_EXTENSION_NAME = "arclayer-stripe"
_STRIPE_SUBSCRIPTION_ID_PATTERN = re.compile(r"sub_[A-Za-z0-9]+")
_STRIPE_PRICE_ID_PATTERN = re.compile(r"price_[A-Za-z0-9]+")
_PROVIDER_ACCOUNT_ID = "platform"
_MICROS_PER_MAJOR_UNIT = 1_000_000
_MICROS_PER_CENT = 10_000
_STRIPE_STATUS_MAP = {
    "active": SubscriptionStatus.ACTIVE,
    "past_due": SubscriptionStatus.PAST_DUE,
    "unpaid": SubscriptionStatus.PAST_DUE,
    "paused": SubscriptionStatus.PAST_DUE,
    "canceled": SubscriptionStatus.CANCELED,
    "incomplete": SubscriptionStatus.PAST_DUE,
    "incomplete_expired": SubscriptionStatus.CANCELED,
}
_STRIPE_INVOICE_EVENT_TYPES = frozenset({
    "invoice.marked_uncollectible",
    "invoice.overpaid",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
})
_STRIPE_INVOICE_PAYMENT_EVENT_TYPES = frozenset({"invoice_payment.paid"})
_STRIPE_REFUND_EVENT_TYPES = frozenset({"refund.updated", "charge.refunded"})
_STRIPE_INVOICE_STATUS_MAP = {
    "open": CommerceInvoiceStatus.OPEN,
    "paid": CommerceInvoiceStatus.PAID,
    "uncollectible": CommerceInvoiceStatus.UNCOLLECTIBLE,
}
_STRIPE_INVOICE_EVENT_STATUSES = {
    "invoice.marked_uncollectible": frozenset({"uncollectible"}),
    "invoice.overpaid": frozenset({"paid"}),
    "invoice.paid": frozenset({"paid"}),
    "invoice.payment_failed": frozenset({"open"}),
    "invoice.payment_succeeded": frozenset({"open", "paid"}),
    "invoice_payment.paid": frozenset({"open", "paid"}),
}
_STRIPE_BILLING_REASON_KIND_MAP = {
    "subscription_create": CommerceTransactionKind.SUBSCRIPTION,
    "subscription_cycle": CommerceTransactionKind.RENEWAL,
}
_STRIPE_ZERO_DECIMAL_PAYMENT_CURRENCIES = frozenset({
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
})


class _StripeWebhookData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    object: dict[str, object]


class _StripeWebhookEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^evt_[A-Za-z0-9]+$", max_length=255)
    type: str = Field(..., min_length=1, max_length=160)
    livemode: bool = False
    account: str | None = Field(default=None, min_length=1, max_length=255)
    created: int | None = None
    data: _StripeWebhookData


class _StripeSubscriptionItemPrice(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^price_[A-Za-z0-9]+$", max_length=255)
    currency: str = Field(pattern=r"^[a-z]{3}$", max_length=3)


class _StripeSubscriptionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    price: _StripeSubscriptionItemPrice


class _StripeSubscriptionItems(BaseModel):
    model_config = ConfigDict(extra="ignore")

    data: tuple[_StripeSubscriptionItem, ...] = Field(min_length=1)


class _StripeSubscriptionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^sub_[A-Za-z0-9]+$", max_length=128)
    customer: str = Field(pattern=r"^cus_[A-Za-z0-9]+$", max_length=128)
    status: str = Field(min_length=1, max_length=32)
    metadata: dict[str, str]
    current_period_start: int
    current_period_end: int
    cancel_at_period_end: bool = False
    schedule: str | None = Field(default=None, pattern=r"^sub_sched_[A-Za-z0-9]+$")
    items: _StripeSubscriptionItems


class _StripeSubscriptionSchedulePhase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    start_date: int


class _StripeSubscriptionSchedule(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^sub_sched_[A-Za-z0-9]+$", max_length=255)
    phases: tuple[_StripeSubscriptionSchedulePhase, ...] = Field(min_length=1)


class _StripeInvoiceStatusTransitions(BaseModel):
    model_config = ConfigDict(extra="ignore")

    finalized_at: int | None = None
    paid_at: int | None = None
    marked_uncollectible_at: int | None = None


class _StripeInvoicePaymentStatusTransitions(BaseModel):
    model_config = ConfigDict(extra="ignore")

    paid_at: int | None = None


class _StripeInvoicePaymentPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    object: Literal["invoice_payment"]
    id: str = Field(pattern=r"^inpay_[A-Za-z0-9]+$", max_length=255)
    invoice: str = Field(pattern=r"^in_[A-Za-z0-9]+$", max_length=255)
    status: Literal["open", "paid", "canceled"]
    amount_requested: int = Field(ge=0)
    amount_paid: int | None = Field(default=None, ge=0)
    currency: str = Field(pattern=r"^[a-z]{3}$", max_length=3)
    created: int
    status_transitions: _StripeInvoicePaymentStatusTransitions = Field(
        default_factory=_StripeInvoicePaymentStatusTransitions
    )

    @model_validator(mode="after")
    def validate_paid_projection(self) -> "_StripeInvoicePaymentPayload":
        if self.amount_paid is not None and self.amount_paid > self.amount_requested:
            raise ValueError("Invoice Payment paid amount cannot exceed amount requested")
        if self.status == "paid" and (self.amount_paid is None or self.status_transitions.paid_at is None):
            raise ValueError("paid Invoice Payment requires amount and transition time")
        return self


class _StripeInvoicePayments(BaseModel):
    model_config = ConfigDict(extra="ignore")

    data: tuple[_StripeInvoicePaymentPayload, ...]
    has_more: bool


class _StripeInvoicePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    object: Literal["invoice"]
    id: str = Field(pattern=r"^in_[A-Za-z0-9]+$", max_length=255)
    subscription: str = Field(pattern=r"^sub_[A-Za-z0-9]+$", max_length=128)
    status: Literal["open", "paid", "uncollectible"]
    currency: str = Field(pattern=r"^[a-z]{3}$", max_length=3)
    amount_due: int = Field(ge=0)
    amount_paid: int = Field(ge=0)
    period_start: int
    period_end: int
    created: int
    billing_reason: Literal["subscription_create", "subscription_cycle"]
    hosted_invoice_url: str | None = Field(default=None, pattern=r"^https://")
    payments: _StripeInvoicePayments
    attempt_count: int = Field(default=0, ge=0)
    next_payment_attempt: int | None = None
    status_transitions: _StripeInvoiceStatusTransitions = Field(default_factory=_StripeInvoiceStatusTransitions)


class _StripeCheckoutPrice(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^price_[A-Za-z0-9]+$", max_length=255)
    currency: str = Field(pattern=r"^[a-z]{3}$", max_length=3)


class _StripeCheckoutLineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    quantity: int = Field(ge=1)
    price: _StripeCheckoutPrice


class _StripeCheckoutLineItems(BaseModel):
    model_config = ConfigDict(extra="ignore")

    data: tuple[_StripeCheckoutLineItem, ...]
    has_more: bool = False


class _StripePaymentIntentPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^pi_[A-Za-z0-9]+$", max_length=255)
    status: str = Field(min_length=1, max_length=32)
    amount_received: int = Field(ge=0)
    currency: str = Field(pattern=r"^[a-z]{3}$", max_length=3)
    metadata: dict[str, str]


class _StripeCheckoutPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^cs_[A-Za-z0-9]+$", max_length=255)
    mode: Literal["payment", "subscription"]
    livemode: bool = False
    metadata: dict[str, str]
    amount_total: int = Field(gt=0)
    currency: str = Field(pattern=r"^[a-z]{3}$", max_length=3)
    payment_intent: _StripePaymentIntentPayload | str | None = None
    invoice: dict[str, object] | str | None = None
    line_items: _StripeCheckoutLineItems


class _StripeRefundPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^re_[A-Za-z0-9]+$", max_length=255)
    payment_intent: str = Field(pattern=r"^pi_[A-Za-z0-9]+$", max_length=255)
    status: Literal["pending", "succeeded", "failed", "canceled"]
    amount: int = Field(gt=0)
    currency: str = Field(pattern=r"^[a-z]{3}$", max_length=3)
    created: int


_TOP_UP_METADATA_KEYS = frozenset({
    "workspace_id",
    "top_up_offer_id",
    "top_up_offer_revision",
    "credit_amount",
    "external_price_id",
    "currency",
    "amount_micros",
})


def _subscription_price_facts(subscription: _StripeSubscriptionPayload) -> tuple[str, str]:
    external_price_id = subscription.metadata["external_price_id"]
    matches = tuple(item.price for item in subscription.items.data if item.price.id == external_price_id)
    if len(matches) != 1:
        raise ValueError("subscription Provider price does not match its metadata")
    currency = subscription.metadata["currency"]
    if currency != matches[0].currency.upper():
        raise ValueError("subscription Provider price currency does not match its metadata")
    return external_price_id, currency


def _stripe_amount_to_micros(*, amount: int, currency: str) -> int:
    scale = _MICROS_PER_MAJOR_UNIT if currency in _STRIPE_ZERO_DECIMAL_PAYMENT_CURRENCIES else _MICROS_PER_CENT
    return amount * scale


def _micros_to_stripe_amount(*, amount_micros: int, currency: str) -> int:
    scale = _MICROS_PER_MAJOR_UNIT if currency in _STRIPE_ZERO_DECIMAL_PAYMENT_CURRENCIES else _MICROS_PER_CENT
    if amount_micros <= 0 or amount_micros % scale != 0:
        raise BadRequest(error="BILLING_REFUND_AMOUNT_INVALID")
    return amount_micros // scale


def _top_up_metadata(metadata: dict[str, str]) -> tuple[UUID, UUID, int, int, str, str, int]:
    if set(metadata) != _TOP_UP_METADATA_KEYS:
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
    try:
        workspace_id = UUID(metadata["workspace_id"])
        offer_id = UUID(metadata["top_up_offer_id"])
        offer_revision = int(metadata["top_up_offer_revision"])
        credit_amount = int(metadata["credit_amount"])
        external_price_id = metadata["external_price_id"]
        currency = metadata["currency"].upper()
        amount_micros = int(metadata["amount_micros"])
    except (KeyError, TypeError, ValueError) as exc:
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc
    if (
        offer_revision < 1
        or credit_amount < 1
        or amount_micros < 1
        or _STRIPE_PRICE_ID_PATTERN.fullmatch(external_price_id) is None
        or re.fullmatch(r"[A-Z]{3}", metadata["currency"]) is None
    ):
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
    return workspace_id, offer_id, offer_revision, credit_amount, external_price_id, currency, amount_micros


def _validate_top_up_invoice(
    *,
    invoice: dict[str, object] | str | None,
    currency: str,
    amount_minor: int,
) -> str | None:
    if invoice is None:
        return None
    if isinstance(invoice, str):
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
    invoice_id = invoice.get("id")
    status = invoice.get("status")
    invoice_currency = invoice.get("currency")
    amount_due = invoice.get("amount_due")
    amount_paid = invoice.get("amount_paid")
    if (
        not isinstance(invoice_id, str)
        or re.fullmatch(r"in_[A-Za-z0-9]+", invoice_id) is None
        or status != "paid"
        or not isinstance(invoice_currency, str)
        or invoice_currency.upper() != currency
        or amount_due != amount_minor
        or amount_paid != amount_minor
    ):
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
    return invoice_id


def _provider_invoice_projection(
    *,
    event: _StripeWebhookEvent,
    invoice: _StripeInvoicePayload,
    event_payment: _StripeInvoicePaymentPayload | None = None,
) -> ProviderInvoiceProjection:
    expected_statuses = _STRIPE_INVOICE_EVENT_STATUSES.get(event.type)
    finalized_at = invoice.status_transitions.finalized_at
    if (
        event.created is None
        or expected_statuses is None
        or invoice.status not in expected_statuses
        or finalized_at is None
    ):
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
    currency = invoice.currency.upper()
    paid_payments = _validated_paid_invoice_payments(
        event=event,
        invoice=invoice,
        event_payment=event_payment,
        currency=currency,
    )
    transactions = tuple(
        _provider_invoice_transaction(
            payment=payment,
            currency=currency,
            kind=_STRIPE_BILLING_REASON_KIND_MAP[invoice.billing_reason],
        )
        for payment in paid_payments
    )
    try:
        return ProviderInvoiceProjection(
            external_invoice_id=invoice.id,
            status=_STRIPE_INVOICE_STATUS_MAP[invoice.status],
            currency=currency,
            amount_due_micros=_stripe_amount_to_micros(amount=invoice.amount_due, currency=currency),
            amount_paid_micros=_stripe_amount_to_micros(amount=invoice.amount_paid, currency=currency),
            period_start=_provider_timestamp(invoice.period_start),
            period_end=_provider_timestamp(invoice.period_end),
            hosted_invoice_url=invoice.hosted_invoice_url,
            issued_at=_provider_timestamp(finalized_at),
            paid_at=(
                _provider_timestamp(invoice.status_transitions.paid_at)
                if invoice.status_transitions.paid_at is not None
                else None
            ),
            occurred_at=_provider_timestamp(event.created),
            transactions=transactions,
        )
    except (KeyError, ValidationError, ValueError) as exc:
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc


def _validated_paid_invoice_payments(
    *,
    event: _StripeWebhookEvent,
    invoice: _StripeInvoicePayload,
    event_payment: _StripeInvoicePaymentPayload | None,
    currency: str,
) -> tuple[_StripeInvoicePaymentPayload, ...]:
    payments = invoice.payments.data
    if (
        invoice.payments.has_more
        or (event.type == "invoice.overpaid" and invoice.amount_paid <= invoice.amount_due)
        or any(payment.invoice != invoice.id or payment.currency.upper() != currency for payment in payments)
    ):
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
    paid_payments = tuple(payment for payment in payments if payment.status == "paid")
    paid_total = sum(payment.amount_paid or 0 for payment in paid_payments)
    if paid_total > invoice.amount_paid:
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
    if event_payment is not None:
        matches = tuple(payment for payment in payments if payment.id == event_payment.id)
        if event_payment.status != "paid" or len(matches) != 1 or matches[0] != event_payment:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
    return paid_payments


def _provider_invoice_transaction(
    *,
    payment: _StripeInvoicePaymentPayload,
    currency: str,
    kind: CommerceTransactionKind,
) -> ProviderTransactionProjection:
    paid_amount = payment.amount_paid
    paid_at = payment.status_transitions.paid_at
    if payment.currency.upper() != currency or paid_amount is None or paid_at is None:
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
    return ProviderTransactionProjection(
        external_transaction_id=payment.id,
        kind=kind,
        status=CommerceTransactionStatus.SUCCEEDED,
        currency=currency,
        amount_micros=_stripe_amount_to_micros(amount=paid_amount, currency=currency),
        occurred_at=_provider_timestamp(paid_at),
    )


class StripeBillingConnector:
    def __init__(
        self,
        *,
        secret_key: str,
        webhook_secret: str,
        api_base_url: str,
        webhook_tolerance_seconds: int,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if not secret_key:
            raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_CONFIGURED")
        self._secret_key = secret_key
        self._provider_mode = self._resolve_provider_mode(secret_key)
        self._webhook_secret = webhook_secret
        self._api_base_url = api_base_url.rstrip("/")
        self._webhook_tolerance_seconds = webhook_tolerance_seconds
        self._client = client

    @staticmethod
    def _resolve_provider_mode(secret_key: str) -> str:
        if secret_key.startswith("sk_test_"):
            return "test"
        if secret_key.startswith("sk_live_"):
            return "live"
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_CONFIGURED")

    @property
    def provider_mode(self) -> str:
        return self._provider_mode

    @staticmethod
    def _require_external_price_id(external_price_id: str) -> str:
        if _STRIPE_PRICE_ID_PATTERN.fullmatch(external_price_id) is None:
            raise BadRequest(error="BILLING_PRICE_NOT_SUPPORTED")
        return external_price_id

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._secret_key}",
            "Stripe-Version": "2025-06-30.basil",
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        data: dict[str, str] | None = None,
        idempotency_key: str | None = None,
    ) -> dict:
        headers = self._headers
        if idempotency_key is not None:
            headers = {**headers, "Idempotency-Key": idempotency_key}
        try:
            if self._client is not None:
                response = await self._client.request(
                    method,
                    f"{self._api_base_url}{path}",
                    data=data,
                    headers=headers,
                )
            else:
                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.request(
                        method,
                        f"{self._api_base_url}{path}",
                        data=data,
                        headers=headers,
                    )
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ServiceUnavailable(error="BILLING_PROVIDER_REQUEST_FAILED") from exc
        if not isinstance(body, dict):
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE")
        return body

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
    ) -> CheckoutSession:
        price_id = self._require_external_price_id(external_price_id)
        metadata = {
            "workspace_id": workspace_id,
            "plan_code": plan_code,
            "plan_id": plan_id,
            "plan_revision_id": plan_revision_id,
            "external_price_id": price_id,
            "billing_cycle": billing_cycle,
            "currency": currency,
        }
        data = {
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": workspace_id,
            "line_items[0][quantity]": "1",
            "line_items[0][price]": price_id,
        }
        for key, value in metadata.items():
            data[f"metadata[{key}]"] = value
            data[f"subscription_data[metadata][{key}]"] = value
        if customer_id:
            data["customer"] = customer_id
        body = await self._request(
            "POST",
            "/checkout/sessions",
            data=data,
            idempotency_key=idempotency_key,
        )
        return self._checkout_session_from_body(body)

    async def create_top_up_checkout_session(
        self,
        *,
        workspace_id: str,
        top_up_offer_id: str,
        top_up_offer_revision: int,
        credit_amount: int,
        external_price_id: str,
        currency: str,
        amount_micros: int,
        success_url: str,
        cancel_url: str,
        customer_id: str | None,
        idempotency_key: str,
    ) -> CheckoutSession:
        price_id = self._require_external_price_id(external_price_id)
        metadata = {
            "workspace_id": workspace_id,
            "top_up_offer_id": top_up_offer_id,
            "top_up_offer_revision": str(top_up_offer_revision),
            "credit_amount": str(credit_amount),
            "external_price_id": price_id,
            "currency": currency,
            "amount_micros": str(amount_micros),
        }
        data = {
            "mode": "payment",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "line_items[0][quantity]": "1",
            "line_items[0][price]": price_id,
            "invoice_creation[enabled]": "true",
        }
        for key, value in metadata.items():
            data[f"metadata[{key}]"] = value
            data[f"payment_intent_data[metadata][{key}]"] = value
        if customer_id:
            data["customer"] = customer_id
        else:
            data["customer_creation"] = "always"
        body = await self._request(
            "POST",
            "/checkout/sessions",
            data=data,
            idempotency_key=idempotency_key,
        )
        return self._checkout_session_from_body(body)

    async def create_portal_session(
        self,
        *,
        customer_id: str,
        return_url: str,
        idempotency_key: str,
    ) -> BillingRedirectSession:
        body = await self._request(
            "POST",
            "/billing_portal/sessions",
            data={"customer": customer_id, "return_url": return_url},
            idempotency_key=idempotency_key,
        )
        return self._redirect_session_from_body(body)

    async def create_refund(
        self,
        *,
        external_transaction_id: str,
        amount_micros: int,
        currency: str,
        idempotency_key: str,
    ) -> ProviderRefund:
        if not re.fullmatch(r"pi_[A-Za-z0-9]+", external_transaction_id):
            raise BadRequest(error="BILLING_REFUND_TRANSACTION_INVALID")
        normalized_currency = currency.upper()
        amount = _micros_to_stripe_amount(amount_micros=amount_micros, currency=normalized_currency)
        body = await self._request(
            "POST",
            "/refunds",
            data={
                "payment_intent": external_transaction_id,
                "amount": str(amount),
            },
            idempotency_key=idempotency_key,
        )
        try:
            refund = _StripeRefundPayload.model_validate(body)
        except ValidationError as exc:
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE") from exc
        if (
            refund.payment_intent != external_transaction_id
            or refund.currency.upper() != normalized_currency
            or _stripe_amount_to_micros(amount=refund.amount, currency=normalized_currency) != amount_micros
        ):
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE")
        return ProviderRefund(
            external_refund_id=refund.id,
            external_transaction_id=refund.payment_intent,
            status=refund.status,
            amount_micros=amount_micros,
            currency=normalized_currency,
        )

    async def schedule_subscription_revision(
        self,
        *,
        preview: RenewalTransitionPreview,
        idempotency_key: str,
    ) -> str:
        facts = preview.provider_scheduling
        if facts is None or facts.provider != "stripe" or facts.provider_mode != self.provider_mode:
            raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_SCHEDULING_UNAVAILABLE")
        subscription = await self._request("GET", f"/subscriptions/{facts.external_subscription_id}")
        current = self._parse_subscription(event_id="provider-schedule", subscription=subscription)
        if current.subscription_id != facts.external_subscription_id:
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE")
        created = await self._request(
            "POST",
            "/subscription_schedules",
            data={"from_subscription": facts.external_subscription_id},
            idempotency_key=idempotency_key,
        )
        schedule = self._parse_subscription_schedule(created)
        await self._request(
            "POST",
            f"/subscription_schedules/{schedule.id}",
            data=self._schedule_update_data(
                schedule=schedule,
                current=current,
                preview=preview,
            ),
            idempotency_key=f"{idempotency_key}:configure",
        )
        return schedule.id

    @staticmethod
    def _checkout_session_from_body(body: dict) -> CheckoutSession:
        external_session_id = body.get("id")
        url = body.get("url")
        expires_at = body.get("expires_at")
        if (
            not isinstance(external_session_id, str)
            or not external_session_id.startswith("cs_")
            or not isinstance(url, str)
            or not url.startswith("https://")
            or not isinstance(expires_at, int)
            or expires_at <= 0
        ):
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE")
        return CheckoutSession(
            url=url,
            external_session_id=external_session_id,
            provider_account_id=_PROVIDER_ACCOUNT_ID,
            expires_at=datetime.fromtimestamp(expires_at, tz=UTC),
        )

    @staticmethod
    def _redirect_session_from_body(body: dict) -> BillingRedirectSession:
        url = body.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE")
        return BillingRedirectSession(url=url)

    def _verify_signature(self, *, payload: bytes, signature: str) -> int:
        if not self._webhook_secret:
            raise ServiceUnavailable(error="BILLING_WEBHOOK_NOT_CONFIGURED")
        parts: dict[str, list[str]] = {}
        for item in signature.split(","):
            key, separator, value = item.partition("=")
            if separator:
                parts.setdefault(key, []).append(value)
        try:
            timestamp = int(parts["t"][0])
            candidates = parts["v1"]
        except (KeyError, ValueError, IndexError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_SIGNATURE_INVALID") from exc
        if abs(int(time.time()) - timestamp) > self._webhook_tolerance_seconds:
            raise BadRequest(error="BILLING_WEBHOOK_SIGNATURE_EXPIRED")
        expected = hmac.new(
            self._webhook_secret.encode(),
            str(timestamp).encode() + b"." + payload,
            hashlib.sha256,
        ).hexdigest()
        if not any(hmac.compare_digest(expected, candidate) for candidate in candidates):
            raise BadRequest(error="BILLING_WEBHOOK_SIGNATURE_INVALID")
        return timestamp

    def verify_webhook(
        self,
        *,
        payload: bytes,
        signature: str,
    ) -> BillingWebhookEnvelope:
        timestamp = self._verify_signature(payload=payload, signature=signature)
        event = self._parse_event(payload)
        return BillingWebhookEnvelope(
            provider_event_id=event.id,
            event_type=event.type,
            provider_mode="live" if event.livemode else "test",
            provider_account_id=event.account or "platform",
            signature_timestamp=datetime.fromtimestamp(timestamp, tz=UTC),
        )

    async def subscription_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderSubscription | None:
        event = self._parse_event(payload)
        if (
            event.id != envelope.provider_event_id
            or event.type != envelope.event_type
            or ("live" if event.livemode else "test") != envelope.provider_mode
            or (event.account or "platform") != envelope.provider_account_id
        ):
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        if event.type not in {
            "checkout.session.completed",
            "customer.subscription.updated",
            "customer.subscription.deleted",
            *_STRIPE_INVOICE_EVENT_TYPES,
            *_STRIPE_INVOICE_PAYMENT_EVENT_TYPES,
        }:
            return None
        if event.type == "checkout.session.completed":
            if event.data.object.get("mode") == "payment":
                return None
            subscription_id = event.data.object.get("subscription")
            if (
                not isinstance(subscription_id, str)
                or _STRIPE_SUBSCRIPTION_ID_PATTERN.fullmatch(subscription_id) is None
            ):
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            subscription = await self._request("GET", f"/subscriptions/{subscription_id}")
            return self._parse_subscription(event_id=event.id, subscription=subscription)
        if event.type in _STRIPE_INVOICE_PAYMENT_EVENT_TYPES:
            event_payment = self._parse_invoice_payment(event.data.object)
            invoice = self._parse_invoice(
                await self._request("GET", f"/invoices/{event_payment.invoice}?expand[]=payments.data")
            )
            payment = _provider_invoice_projection(
                event=event,
                invoice=invoice,
                event_payment=event_payment,
            )
            subscription = await self._request("GET", f"/subscriptions/{invoice.subscription}")
            return self._parse_subscription(
                event_id=event.id,
                subscription=subscription,
                payment=payment,
            )
        if event.type in _STRIPE_INVOICE_EVENT_TYPES:
            invoice = self._parse_invoice(event.data.object)
            dunning_event = self._invoice_dunning_event(event=event, invoice=invoice)
            payment = _provider_invoice_projection(event=event, invoice=invoice)
            subscription = await self._request("GET", f"/subscriptions/{invoice.subscription}")
            return self._parse_subscription(
                event_id=event.id,
                subscription=subscription,
                dunning_event=dunning_event,
                payment=payment,
            )
        else:
            subscription = event.data.object
        return self._parse_subscription(
            event_id=event.id,
            subscription=subscription,
            include_confirmed_transition=event.type == "customer.subscription.updated",
        )

    async def checkout_outcome_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderCheckoutOutcome | None:
        del payload, envelope
        return None

    async def top_up_settlement_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderTopUpSettlement | None:
        event = self._parse_event(payload)
        if (
            event.id != envelope.provider_event_id
            or event.type != envelope.event_type
            or ("live" if event.livemode else "test") != envelope.provider_mode
            or (event.account or "platform") != envelope.provider_account_id
        ):
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        if event.type != "checkout.session.completed":
            return None
        if event.data.object.get("mode") != "payment":
            return None
        event_session_id = event.data.object.get("id")
        event_metadata = event.data.object.get("metadata")
        if (
            not isinstance(event_session_id, str)
            or re.fullmatch(r"cs_[A-Za-z0-9]+", event_session_id) is None
            or not isinstance(event_metadata, dict)
            or any(not isinstance(key, str) or not isinstance(value, str) for key, value in event_metadata.items())
        ):
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        try:
            checkout_body = await self._request(
                "GET",
                f"/checkout/sessions/{event_session_id}"
                "?expand[]=line_items.data.price&expand[]=payment_intent&expand[]=invoice",
            )
            checkout = _StripeCheckoutPayload.model_validate(checkout_body)
            if checkout.id != event_session_id or checkout.mode != "payment":
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            if checkout.livemode != event.livemode or checkout.metadata != event_metadata:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            workspace_id, offer_id, offer_revision, credit_amount, price_id, currency, amount_micros = _top_up_metadata(
                checkout.metadata
            )
            if checkout.currency.upper() != currency:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            if _stripe_amount_to_micros(amount=checkout.amount_total, currency=currency) != amount_micros:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            if len(checkout.line_items.data) != 1 or checkout.line_items.has_more:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            item = checkout.line_items.data[0]
            if item.quantity != 1 or item.price.id != price_id or item.price.currency.upper() != currency:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            payment_intent = checkout.payment_intent
            if not isinstance(payment_intent, _StripePaymentIntentPayload):
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            if (
                payment_intent.status != "succeeded"
                or payment_intent.currency.upper() != currency
                or payment_intent.amount_received != checkout.amount_total
                or payment_intent.metadata != checkout.metadata
            ):
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            invoice_id = _validate_top_up_invoice(
                invoice=checkout.invoice,
                currency=currency,
                amount_minor=checkout.amount_total,
            )
            if event.created is None:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            return ProviderTopUpSettlement(
                event_id=event.id,
                checkout_session_id=None,
                external_session_id=checkout.id,
                workspace_id=workspace_id,
                actor_user_id=None,
                top_up_offer_id=offer_id,
                top_up_offer_revision=offer_revision,
                external_price_id=price_id,
                checkout_request_fingerprint=None,
                outcome="succeeded",
                currency=currency,
                amount_micros=amount_micros,
                credit_amount=credit_amount,
                external_transaction_id=payment_intent.id,
                external_invoice_id=invoice_id,
                occurred_at=_provider_timestamp(event.created),
            )
        except (ValidationError, ValueError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc

    async def refund_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderRefundOutcome | None:
        event = self._parse_event(payload)
        if (
            event.id != envelope.provider_event_id
            or event.type != envelope.event_type
            or ("live" if event.livemode else "test") != envelope.provider_mode
            or (event.account or "platform") != envelope.provider_account_id
        ):
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        if event.type not in _STRIPE_REFUND_EVENT_TYPES:
            return None
        refund_payload: object = event.data.object
        if event.type == "charge.refunded":
            refunds = event.data.object.get("refunds")
            if not isinstance(refunds, dict):
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            data = refunds.get("data")
            if not isinstance(data, list) or len(data) != 1:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            refund_payload = data[0]
        try:
            refund = _StripeRefundPayload.model_validate(refund_payload)
        except ValidationError as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc
        if refund.status == "pending":
            return None
        if event.created is None:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        return ProviderRefundOutcome(
            event_id=event.id,
            external_refund_id=refund.id,
            external_transaction_id=refund.payment_intent,
            status=refund.status,
            amount_micros=_stripe_amount_to_micros(amount=refund.amount, currency=refund.currency.upper()),
            currency=refund.currency.upper(),
            occurred_at=_provider_timestamp(event.created),
        )

    @staticmethod
    def _parse_event(payload: bytes) -> _StripeWebhookEvent:
        try:
            return _StripeWebhookEvent.model_validate(json.loads(payload))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc

    @staticmethod
    def _parse_invoice(invoice: object) -> _StripeInvoicePayload:
        try:
            return _StripeInvoicePayload.model_validate(invoice)
        except ValidationError as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc

    @staticmethod
    def _parse_invoice_payment(payment: object) -> _StripeInvoicePaymentPayload:
        try:
            return _StripeInvoicePaymentPayload.model_validate(payment)
        except ValidationError as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc

    @staticmethod
    def _parse_subscription_schedule(schedule: object) -> _StripeSubscriptionSchedule:
        try:
            return _StripeSubscriptionSchedule.model_validate(schedule)
        except ValidationError as exc:
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE") from exc

    @staticmethod
    def _schedule_update_data(
        *,
        schedule: _StripeSubscriptionSchedule,
        current: ProviderSubscription,
        preview: RenewalTransitionPreview,
    ) -> dict[str, str]:
        facts = preview.provider_scheduling
        if facts is None:
            raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_SCHEDULING_UNAVAILABLE")
        data = {
            "end_behavior": "release",
            "phases[0][start_date]": str(schedule.phases[0].start_date),
            "phases[0][end_date]": str(int(facts.effective_at.timestamp())),
            "phases[0][items][0][price]": current.external_price_id,
            "phases[1][start_date]": str(int(facts.effective_at.timestamp())),
            "phases[1][items][0][price]": facts.external_price_id,
            "phases[1][metadata][workspace_id]": str(preview.workspace_id),
            "phases[1][metadata][plan_id]": str(preview.target_revision.plan_id),
            "phases[1][metadata][plan_revision_id]": str(preview.target_revision.id),
            "phases[1][metadata][external_price_id]": facts.external_price_id,
            "phases[1][metadata][billing_cycle]": facts.billing_cycle,
            "phases[1][metadata][currency]": facts.currency,
        }
        return data

    @staticmethod
    def _invoice_dunning_event(
        *, event: _StripeWebhookEvent, invoice: _StripeInvoicePayload
    ) -> ProviderDunningEvent | None:
        if event.created is None:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        occurred_at = _provider_timestamp(event.created)
        if event.type == "invoice.payment_failed":
            if invoice.next_payment_attempt is None:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            return ProviderDunningEvent(
                kind="payment_failure",
                provider_period_id=invoice.id,
                occurred_at=occurred_at,
                recovery_deadline=_provider_timestamp(invoice.next_payment_attempt),
            )
        if event.type in {"invoice.paid", "invoice.payment_succeeded"}:
            paid_at = invoice.status_transitions.paid_at
            if invoice.attempt_count < 2 or paid_at is None:
                return None
            return ProviderDunningEvent(
                kind="payment_recovered",
                provider_period_id=invoice.id,
                occurred_at=_provider_timestamp(paid_at),
            )
        if event.type == "invoice.marked_uncollectible":
            marked_at = invoice.status_transitions.marked_uncollectible_at
            if marked_at is None:
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            return ProviderDunningEvent(
                kind="final_unpaid",
                provider_period_id=invoice.id,
                occurred_at=_provider_timestamp(marked_at),
            )
        if event.type == "invoice.overpaid":
            return None
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")

    @staticmethod
    def _parse_subscription(
        *,
        event_id: object,
        subscription: object,
        dunning_event: ProviderDunningEvent | None = None,
        payment: ProviderInvoiceProjection | None = None,
        include_confirmed_transition: bool = False,
    ) -> ProviderSubscription:
        try:
            parsed = _StripeSubscriptionPayload.model_validate(subscription)
            external_price_id, currency = _subscription_price_facts(parsed)
            return ProviderSubscription(
                event_id=str(event_id),
                workspace_id=UUID(parsed.metadata["workspace_id"]),
                plan_id=UUID(parsed.metadata["plan_id"]),
                plan_revision_id=UUID(parsed.metadata["plan_revision_id"]),
                external_price_id=external_price_id,
                billing_cycle=BillingCycle(parsed.metadata["billing_cycle"]),
                currency=currency,
                customer_id=parsed.customer,
                subscription_id=parsed.id,
                status=_STRIPE_STATUS_MAP[parsed.status],
                current_period_start=datetime.fromtimestamp(parsed.current_period_start, tz=UTC),
                current_period_end=datetime.fromtimestamp(parsed.current_period_end, tz=UTC),
                cancel_at_period_end=parsed.cancel_at_period_end,
                dunning_event=dunning_event,
                payment=payment,
                confirmed_transition=(
                    ProviderConfirmedTransitionEvidence(
                        provider_schedule_id=parsed.schedule,
                        target_revision_id=UUID(parsed.metadata["plan_revision_id"]),
                        effective_at=datetime.fromtimestamp(parsed.current_period_start, tz=UTC),
                    )
                    if include_confirmed_transition and parsed.schedule is not None
                    else None
                ),
            )
        except (KeyError, ValidationError, ValueError, OverflowError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc


def _provider_timestamp(value: int) -> datetime:
    try:
        return datetime.fromtimestamp(value, tz=UTC)
    except (OverflowError, OSError, ValueError) as exc:
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc


class StripeBillingExtension:
    name = _EXTENSION_NAME

    def create_connector(self, *, client: httpx.AsyncClient | None = None) -> StripeBillingConnector:
        billing = get_settings().billing
        return StripeBillingConnector(
            secret_key=billing.stripe_secret_key.get_secret_value(),
            webhook_secret=billing.stripe_webhook_secret.get_secret_value(),
            api_base_url=billing.stripe_api_base_url,
            webhook_tolerance_seconds=billing.webhook_tolerance_seconds,
            client=client,
        )

    def arclayer_register(self, registry: PluginRegistry) -> None:
        registry.connectors.register(
            extension=self.name,
            definition=ConnectorDefinition(
                key=_CONNECTOR_KEY,
                kind=ConnectorKind.BILLING,
                version="1.0.0",
                trust_level=ConnectorTrustLevel.OFFICIAL,
                capabilities=("checkout", "customer_portal", "subscription_webhook", "refund"),
                config_schema={
                    "apiBaseUrl": {"type": "string", "format": "uri"},
                    "webhookToleranceSeconds": {"type": "integer", "minimum": 30, "maximum": 3600},
                },
                secret_schema={
                    "secretKey": {"type": "string", "writeOnly": True},
                    "webhookSecret": {"type": "string", "writeOnly": True},
                },
                webhook_events=(
                    "checkout.session.completed",
                    "customer.subscription.updated",
                    "customer.subscription.deleted",
                    "invoice.paid",
                    "invoice.overpaid",
                    "invoice.payment_failed",
                    "invoice.payment_succeeded",
                    "invoice.marked_uncollectible",
                    "invoice_payment.paid",
                    "refund.updated",
                    "charge.refunded",
                ),
                health_contract=("configured", "reachable", "webhook_configured"),
                admin=ConnectorAdminMetadata(
                    label_key="settings:SETTINGS_SYSTEM_PLUGIN_STRIPE_NAME",
                    description_key="settings:SETTINGS_SYSTEM_PLUGIN_STRIPE_DESC",
                    settings_section="billing",
                    icon_key="stripe",
                ),
            ),
            factory=self.create_connector,
        )
        logger.info("Stripe billing Connector registered", connector=_CONNECTOR_KEY)


def create_plugin() -> StripeBillingExtension:
    return StripeBillingExtension()
