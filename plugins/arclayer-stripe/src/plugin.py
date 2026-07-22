"""Official trusted Stripe billing Connector."""

import hashlib
import hmac
import json
import re
import time
from datetime import UTC, datetime

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
from src.models.commerce.billing import SubscriptionStatus
from src.modules.commerce.billing_connector import (
    BillingWebhookEnvelope,
    CheckoutSession,
    ProviderSubscription,
)

logger = get_logger(__name__)

_CONNECTOR_KEY = "billing.stripe"
_EXTENSION_NAME = "arclayer-stripe"
_STRIPE_SUBSCRIPTION_ID_PATTERN = re.compile(r"sub_[A-Za-z0-9]+")
_STRIPE_STATUS_MAP = {
    "trialing": SubscriptionStatus.TRIALING,
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
    data: _StripeWebhookData


class _StripeSubscriptionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^sub_[A-Za-z0-9]+$", max_length=128)
    customer: str = Field(pattern=r"^cus_[A-Za-z0-9]+$", max_length=128)
    status: str = Field(min_length=1, max_length=32)
    metadata: dict[str, str]
    current_period_start: int
    current_period_end: int
    cancel_at_period_end: bool = False


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
        self._webhook_secret = webhook_secret
        self._api_base_url = api_base_url.rstrip("/")
        self._webhook_tolerance_seconds = webhook_tolerance_seconds
        self._client = client

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._secret_key}",
            "Stripe-Version": "2025-06-30.basil",
        }

    async def _request(self, method: str, path: str, *, data: dict[str, str] | None = None) -> dict:
        try:
            if self._client is not None:
                response = await self._client.request(
                    method,
                    f"{self._api_base_url}{path}",
                    data=data,
                    headers=self._headers,
                )
            else:
                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.request(
                        method,
                        f"{self._api_base_url}{path}",
                        data=data,
                        headers=self._headers,
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
        plan_name: str,
        billing_cycle: str,
        currency: str,
        amount_micros: int,
        success_url: str,
        cancel_url: str,
        customer_id: str | None,
    ) -> CheckoutSession:
        if amount_micros <= 0 or amount_micros % 10_000:
            raise BadRequest(error="BILLING_PRICE_NOT_SUPPORTED")
        interval = "month" if billing_cycle == "monthly" else "year"
        metadata = {
            "workspace_id": workspace_id,
            "plan_code": plan_code,
            "billing_cycle": billing_cycle,
        }
        data = {
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": workspace_id,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": currency.lower(),
            "line_items[0][price_data][unit_amount]": str(amount_micros // 10_000),
            "line_items[0][price_data][recurring][interval]": interval,
            "line_items[0][price_data][product_data][name]": plan_name,
        }
        for key, value in metadata.items():
            data[f"metadata[{key}]"] = value
            data[f"subscription_data[metadata][{key}]"] = value
        if customer_id:
            data["customer"] = customer_id
        body = await self._request("POST", "/checkout/sessions", data=data)
        return self._session_from_body(body)

    async def create_portal_session(self, *, customer_id: str, return_url: str) -> CheckoutSession:
        body = await self._request(
            "POST",
            "/billing_portal/sessions",
            data={"customer": customer_id, "return_url": return_url},
        )
        return self._session_from_body(body)

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
        else:
            subscription = event.data.object
        return self._parse_subscription(event_id=event.id, subscription=subscription)

    @staticmethod
    def _parse_event(payload: bytes) -> _StripeWebhookEvent:
        try:
            return _StripeWebhookEvent.model_validate(json.loads(payload))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc

    @staticmethod
    def _parse_subscription(*, event_id: object, subscription: object) -> ProviderSubscription:
        try:
            parsed = _StripeSubscriptionPayload.model_validate(subscription)
            return ProviderSubscription(
                event_id=str(event_id),
                workspace_id=parsed.metadata["workspace_id"],
                plan_code=parsed.metadata["plan_code"],
                billing_cycle=parsed.metadata["billing_cycle"],
                customer_id=parsed.customer,
                subscription_id=parsed.id,
                status=_STRIPE_STATUS_MAP[parsed.status],
                current_period_start=datetime.fromtimestamp(parsed.current_period_start, tz=UTC),
                current_period_end=datetime.fromtimestamp(parsed.current_period_end, tz=UTC),
                cancel_at_period_end=parsed.cancel_at_period_end,
            )
        except (KeyError, ValidationError, ValueError, OverflowError) as exc:
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
