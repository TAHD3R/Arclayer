from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import BadRequest
from src.models.commerce.billing import BillingCycle
from src.modules.commerce.billing_connector import (
    BillingConnector,
    CheckoutSession,
    build_billing_operation_idempotency_key,
)
from src.modules.commerce.billing_service import (
    BillingCheckoutReader,
    BillingCheckoutSelection,
    BillingService,
    WorkspaceBillingReader,
)
from src.modules.commerce.schema import CheckoutSessionCreate


def test_billing_operation_idempotency_key_is_stable_and_hides_business_identifiers() -> None:
    components = ("workspace-private-id", "subscription-private-id", "premium")

    first = build_billing_operation_idempotency_key(
        operation="checkout",
        business_identity=components,
    )
    replay = build_billing_operation_idempotency_key(
        operation="checkout",
        business_identity=components,
    )
    changed = build_billing_operation_idempotency_key(
        operation="checkout",
        business_identity=(*components, "yearly"),
    )

    assert first == replay
    assert first != changed
    assert first.startswith("arclayer:checkout:")
    assert all(component not in first for component in components)


@pytest.mark.asyncio
async def test_checkout_readiness_uses_revision_scoped_provider_prices() -> None:
    available_revision_id = uuid4()
    revision_ids = {available_revision_id, uuid4()}
    plans = SimpleNamespace(list_checkout_revision_ids=AsyncMock(return_value={available_revision_id}))
    provider = SimpleNamespace(provider_mode="live")
    service = BillingService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        provider_name="stripe",
        plans=cast(BillingCheckoutReader, plans),
        commerce=cast(WorkspaceBillingReader, SimpleNamespace()),
    )

    available = await service.list_checkout_revision_ids(revision_ids=revision_ids)

    assert available == {available_revision_id}
    plans.list_checkout_revision_ids.assert_awaited_once_with(
        revision_ids=revision_ids,
        provider="stripe",
        provider_mode="live",
    )


@pytest.mark.asyncio
async def test_checkout_creation_does_not_mutate_local_subscription() -> None:
    workspace_id = uuid4()
    subscription = SimpleNamespace(
        id=uuid4(),
        plan_revision_id=uuid4(),
        billing_cycle=BillingCycle.MONTHLY,
        external_customer_id=None,
    )
    current_revision = SimpleNamespace(id=subscription.plan_revision_id)
    target_plan = BillingCheckoutSelection(
        plan_id=uuid4(),
        plan_revision_id=uuid4(),
        external_price_id="price_premiumYearly",
        currency="USD",
    )
    commerce = SimpleNamespace(
        ensure_workspace_billing=AsyncMock(return_value=(subscription, SimpleNamespace(), current_revision)),
    )
    provider = SimpleNamespace(
        provider_mode="test",
        create_checkout_session=AsyncMock(return_value=CheckoutSession(url="https://checkout.stripe.test/cs_test")),
    )
    plans = SimpleNamespace(get_published_checkout_selection=AsyncMock(return_value=target_plan))
    service = BillingService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        provider_name="stripe",
        plans=cast(BillingCheckoutReader, plans),
        commerce=cast(WorkspaceBillingReader, commerce),
    )

    result = await service.create_checkout(
        workspace_id=workspace_id,
        payload=CheckoutSessionCreate(plan_code="premium", billing_interval=BillingCycle.YEARLY),
    )

    assert result.url == "https://checkout.stripe.test/cs_test"
    assert subscription.plan_revision_id == current_revision.id
    assert subscription.billing_cycle == BillingCycle.MONTHLY
    plans.get_published_checkout_selection.assert_awaited_once_with(
        plan_code="premium",
        provider="stripe",
        provider_mode="test",
        billing_cycle=BillingCycle.YEARLY,
    )
    provider.create_checkout_session.assert_awaited_once_with(
        workspace_id=str(workspace_id),
        plan_id=str(target_plan.plan_id),
        plan_revision_id=str(target_plan.plan_revision_id),
        external_price_id="price_premiumYearly",
        billing_cycle="yearly",
        currency="USD",
        success_url="https://app.arclayer.localhost/?billing=success",
        cancel_url="https://app.arclayer.localhost/?billing=canceled",
        customer_id=None,
        idempotency_key=build_billing_operation_idempotency_key(
            operation="checkout",
            business_identity=(
                str(workspace_id),
                str(subscription.id),
                str(current_revision.id),
                str(target_plan.plan_id),
                str(target_plan.plan_revision_id),
                "price_premiumYearly",
                "yearly",
            ),
        ),
    )


@pytest.mark.asyncio
async def test_checkout_rejects_a_missing_active_plan_before_provider_io() -> None:
    workspace_id = uuid4()
    subscription = SimpleNamespace(
        id=uuid4(),
        plan_revision_id=uuid4(),
        billing_cycle=BillingCycle.MONTHLY,
        external_customer_id=None,
    )
    commerce = SimpleNamespace(
        ensure_workspace_billing=AsyncMock(return_value=(subscription, SimpleNamespace(), SimpleNamespace(id=uuid4()))),
    )
    provider = SimpleNamespace(provider_mode="test", create_checkout_session=AsyncMock())
    plans = SimpleNamespace(get_published_checkout_selection=AsyncMock(return_value=None))
    service = BillingService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        provider_name="stripe",
        plans=cast(BillingCheckoutReader, plans),
        commerce=cast(WorkspaceBillingReader, commerce),
    )

    with pytest.raises(BadRequest) as captured:
        await service.create_checkout(
            workspace_id=workspace_id,
            payload=CheckoutSessionCreate(plan_code="retired", billing_interval=BillingCycle.MONTHLY),
        )

    assert captured.value.error == "COMMERCE_PLAN_NOT_FOUND"
    plans.get_published_checkout_selection.assert_awaited_once()
    provider.create_checkout_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_portal_creation_uses_a_state_bound_idempotency_key() -> None:
    workspace_id = uuid4()
    subscription = SimpleNamespace(
        id=uuid4(),
        external_customer_id="cus_test",
    )
    current_revision = SimpleNamespace(id=uuid4())
    commerce = SimpleNamespace(
        ensure_workspace_billing=AsyncMock(return_value=(subscription, SimpleNamespace(), current_revision)),
    )
    provider = SimpleNamespace(
        create_portal_session=AsyncMock(return_value=CheckoutSession(url="https://billing.stripe.test/session")),
    )
    service = BillingService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        provider_name="stripe",
        plans=cast(BillingCheckoutReader, SimpleNamespace()),
        commerce=cast(WorkspaceBillingReader, commerce),
    )

    result = await service.create_portal(workspace_id=workspace_id)

    assert result.url == "https://billing.stripe.test/session"
    provider.create_portal_session.assert_awaited_once_with(
        customer_id="cus_test",
        return_url="https://app.arclayer.localhost",
        idempotency_key=build_billing_operation_idempotency_key(
            operation="portal",
            business_identity=(
                str(workspace_id),
                str(subscription.id),
                str(current_revision.id),
                "cus_test",
            ),
        ),
    )
