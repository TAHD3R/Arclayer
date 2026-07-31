"""Official trusted Stripe billing Connector."""

import hashlib
import hmac
import json
import re
import time
from datetime import UTC, datetime
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

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
from src.modules.commerce.billing_connector import (
    BillingWebhookEnvelope,
    CheckoutSession,
    ProviderDunningEvent,
    ProviderSubscription,
)
from src.modules.commerce.subscription_transitions.schema import (
    ProviderConfirmedTransitionEvidence,
    RenewalTransitionPreview,
)

logger = get_logger(__name__)

_CONNECTOR_KEY = "billing.stripe"
_EXTENSION_NAME = "arclayer-stripe"
_STRIPE_SUBSCRIPTION_ID_PATTERN = re.compile(r"sub_[A-Za-z0-9]+")
_STRIPE_PRICE_ID_PATTERN = re.compile(r"price_[A-Za-z0-9]+")
_STRIPE_STATUS_MAP = {
    "trialing": SubscriptionStatus.ACTIVE,
    "active": SubscriptionStatus.ACTIVE,
    "past_due": SubscriptionStatus.PAST_DUE,
    "unpaid": SubscriptionStatus.PAST_DUE,
    "paused": SubscriptionStatus.PAST_DUE,
    "canceled": SubscriptionStatus.CANCELED,
    "incomplete": SubscriptionStatus.PAST_DUE,
    "incomplete_expired": SubscriptionStatus.CANCELED,
}


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

    paid_at: int | None = None
    marked_uncollectible_at: int | None = None


class _StripeInvoicePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^in_[A-Za-z0-9]+$", max_length=255)
    subscription: str = Field(pattern=r"^sub_[A-Za-z0-9]+$", max_length=128)
    attempt_count: int = Field(ge=1)
    next_payment_attempt: int | None = None
    status_transitions: _StripeInvoiceStatusTransitions = Field(default_factory=_StripeInvoiceStatusTransitions)


def _subscription_price_facts(subscription: _StripeSubscriptionPayload) -> tuple[str, str]:
    external_price_id = subscription.metadata["external_price_id"]
    matches = tuple(item.price for item in subscription.items.data if item.price.id == external_price_id)
    if len(matches) != 1:
        raise ValueError("subscription Provider price does not match its metadata")
    currency = subscription.metadata["currency"]
    if currency != matches[0].currency.upper():
        raise ValueError("subscription Provider price currency does not match its metadata")
    return external_price_id, currency


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
        return self._session_from_body(body)

    async def create_portal_session(
        self,
        *,
        customer_id: str,
        return_url: str,
        idempotency_key: str,
    ) -> CheckoutSession:
        body = await self._request(
            "POST",
            "/billing_portal/sessions",
            data={"customer": customer_id, "return_url": return_url},
            idempotency_key=idempotency_key,
        )
        return self._session_from_body(body)

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
    def _session_from_body(body: dict) -> CheckoutSession:
        url = body.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE")
        return CheckoutSession(url=url)

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
            "invoice.payment_failed",
            "invoice.payment_succeeded",
            "invoice.marked_uncollectible",
        }:
            return None
        if event.type == "checkout.session.completed":
            subscription_id = event.data.object.get("subscription")
            if (
                not isinstance(subscription_id, str)
                or _STRIPE_SUBSCRIPTION_ID_PATTERN.fullmatch(subscription_id) is None
            ):
                raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
            subscription = await self._request("GET", f"/subscriptions/{subscription_id}")
            return self._parse_subscription(event_id=event.id, subscription=subscription)
        if event.type.startswith("invoice."):
            invoice = self._parse_invoice(event.data.object)
            dunning_event = self._invoice_dunning_event(event=event, invoice=invoice)
            subscription = await self._request("GET", f"/subscriptions/{invoice.subscription}")
            return self._parse_subscription(
                event_id=event.id,
                subscription=subscription,
                dunning_event=dunning_event,
            )
        else:
            subscription = event.data.object
        return self._parse_subscription(
            event_id=event.id,
            subscription=subscription,
            include_confirmed_transition=event.type == "customer.subscription.updated",
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
        if event.type == "invoice.payment_succeeded":
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
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")

    @staticmethod
    def _parse_subscription(
        *,
        event_id: object,
        subscription: object,
        dunning_event: ProviderDunningEvent | None = None,
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
                capabilities=("checkout", "customer_portal", "subscription_webhook"),
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
                    "invoice.payment_failed",
                    "invoice.payment_succeeded",
                    "invoice.marked_uncollectible",
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
