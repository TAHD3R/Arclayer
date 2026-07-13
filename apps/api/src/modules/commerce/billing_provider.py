from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from datetime import UTC, datetime
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.core.exceptions import BadRequest, ServiceUnavailable

_STRIPE_SUBSCRIPTION_ID_PATTERN = re.compile(r"sub_[A-Za-z0-9]+")


class CheckoutSession(BaseModel):
    model_config = ConfigDict(frozen=True)

    url: str


class ProviderSubscription(BaseModel):
    model_config = ConfigDict(frozen=True)

    event_id: str
    workspace_id: str
    plan_code: str
    billing_cycle: str
    customer_id: str
    subscription_id: str
    status: str
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool


class _StripeWebhookData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    object: dict[str, object]


class _StripeWebhookEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(pattern=r"^evt_[A-Za-z0-9]+$", max_length=255)
    type: str
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


class BillingProvider(Protocol):
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

    async def subscription_from_webhook(
        self,
        *,
        payload: bytes,
        signature: str,
    ) -> ProviderSubscription | None: ...


class StripeBillingProvider:
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

    async def _post(self, path: str, data: dict[str, str]) -> dict:
        headers = {
            "Authorization": f"Bearer {self._secret_key}",
            "Stripe-Version": "2025-06-30.basil",
        }
        try:
            if self._client is not None:
                response = await self._client.post(f"{self._api_base_url}{path}", data=data, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.post(
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

    async def _get(self, path: str) -> dict:
        headers = {
            "Authorization": f"Bearer {self._secret_key}",
            "Stripe-Version": "2025-06-30.basil",
        }
        try:
            if self._client is not None:
                response = await self._client.get(f"{self._api_base_url}{path}", headers=headers)
            else:
                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.get(f"{self._api_base_url}{path}", headers=headers)
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
        body = await self._post("/checkout/sessions", data)
        url = body.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE")
        return CheckoutSession(url=url)

    async def create_portal_session(self, *, customer_id: str, return_url: str) -> CheckoutSession:
        body = await self._post(
            "/billing_portal/sessions",
            {"customer": customer_id, "return_url": return_url},
        )
        url = body.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise ServiceUnavailable(error="BILLING_PROVIDER_INVALID_RESPONSE")
        return CheckoutSession(url=url)

    def _verify_signature(self, *, payload: bytes, signature: str) -> None:
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
        signed_payload = str(timestamp).encode() + b"." + payload
        expected = hmac.new(
            self._webhook_secret.encode(),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()
        if not any(hmac.compare_digest(expected, candidate) for candidate in candidates):
            raise BadRequest(error="BILLING_WEBHOOK_SIGNATURE_INVALID")

    async def subscription_from_webhook(
        self,
        *,
        payload: bytes,
        signature: str,
    ) -> ProviderSubscription | None:
        self._verify_signature(payload=payload, signature=signature)
        try:
            event = _StripeWebhookEvent.model_validate(json.loads(payload))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc
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
            subscription = await self._get(f"/subscriptions/{subscription_id}")
        else:
            subscription = event.data.object
        return self._parse_subscription(event_id=event.id, subscription=subscription)

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
                status=parsed.status,
                current_period_start=datetime.fromtimestamp(
                    parsed.current_period_start,
                    tz=UTC,
                ),
                current_period_end=datetime.fromtimestamp(
                    parsed.current_period_end,
                    tz=UTC,
                ),
                cancel_at_period_end=parsed.cancel_at_period_end,
            )
        except (KeyError, ValidationError, ValueError, OverflowError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc
