from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from pydantic import SecretStr

from src.core.exceptions import ServiceUnavailable
from src.modules.commerce.subscription_transitions.provider_cancellation import (
    StripeSubscriptionTransitionCancellationPort,
)


def _settings(*, secret: str = "sk_test_secret") -> SimpleNamespace:
    return SimpleNamespace(
        billing=SimpleNamespace(
            provider="stripe",
            stripe_secret_key=SecretStr(secret),
            stripe_api_base_url="https://api.stripe.test/v1",
        )
    )


@pytest.mark.asyncio
async def test_stripe_cancellation_releases_schedule_with_stable_provider_idempotency() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "sub_sched_123", "status": "released"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        port = StripeSubscriptionTransitionCancellationPort(_settings(), client=client)  # type: ignore[arg-type]
        await port.cancel_schedules(
            provider_schedule_ids=("sub_sched_123",),
            idempotency_key="transition-cancel-1",
        )

    assert len(requests) == 1
    assert requests[0].url.path == "/v1/subscription_schedules/sub_sched_123/release"
    assert requests[0].headers["idempotency-key"] == "transition-cancel-1:sub_sched_123"
    assert requests[0].headers["authorization"] == "Bearer sk_test_secret"


@pytest.mark.asyncio
async def test_stripe_cancellation_rejects_unconfirmed_release_response() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"id": "sub_sched_123", "status": "active"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        port = StripeSubscriptionTransitionCancellationPort(_settings(), client=client)  # type: ignore[arg-type]
        with pytest.raises(ServiceUnavailable) as exc:
            await port.cancel_schedules(
                provider_schedule_ids=("sub_sched_123",),
                idempotency_key="transition-cancel-1",
            )

    assert exc.value.error == "SUBSCRIPTION_TRANSITION_PROVIDER_CANCELLATION_INVALID_RESPONSE"
