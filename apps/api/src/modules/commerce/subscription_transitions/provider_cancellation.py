from __future__ import annotations

import re

import httpx

from src.config import Settings
from src.core.exceptions import ServiceUnavailable

_STRIPE_SCHEDULE_ID_PATTERN = re.compile(r"^sub_sched_[A-Za-z0-9]+$")
_STRIPE_API_VERSION = "2025-06-30.basil"


class StripeSubscriptionTransitionCancellationPort:
    """Release Stripe schedules while preserving their underlying Subscriptions."""

    def __init__(self, settings: Settings, *, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    async def cancel_schedules(
        self,
        *,
        provider_schedule_ids: tuple[str, ...],
        idempotency_key: str,
    ) -> None:
        billing = self._settings.billing
        secret = billing.stripe_secret_key.get_secret_value()
        if billing.provider != "stripe" or not secret:
            raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_CANCELLATION_PORT_UNAVAILABLE")
        for schedule_id in provider_schedule_ids:
            if _STRIPE_SCHEDULE_ID_PATTERN.fullmatch(schedule_id) is None:
                raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_SCHEDULE_ID_INVALID")
            response = await self._request(
                schedule_id=schedule_id,
                secret=secret,
                idempotency_key=f"{idempotency_key}:{schedule_id}",
            )
            if response.get("id") != schedule_id or response.get("status") != "released":
                raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_CANCELLATION_INVALID_RESPONSE")

    async def _request(
        self,
        *,
        schedule_id: str,
        secret: str,
        idempotency_key: str,
    ) -> dict[str, object]:
        url = f"{self._settings.billing.stripe_api_base_url.rstrip('/')}/subscription_schedules/{schedule_id}/release"
        headers = {
            "Authorization": f"Bearer {secret}",
            "Idempotency-Key": idempotency_key,
            "Stripe-Version": _STRIPE_API_VERSION,
        }
        try:
            if self._client is not None:
                response = await self._client.post(url, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.post(url, headers=headers)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_CANCELLATION_FAILED") from exc
        if not isinstance(payload, dict):
            raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_CANCELLATION_INVALID_RESPONSE")
        return payload
