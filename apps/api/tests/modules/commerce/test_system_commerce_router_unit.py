from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI

from src.common.utils.public_ids import encode_uuid
from src.models.commerce.billing import BillingCycle, PlanRevisionStatus, SubscriptionStatus
from src.modules.commerce import system_router
from src.modules.commerce.platform_schema import (
    PlatformCommercePlanCatalogOut,
    PlatformCommerceRevisionSummaryOut,
    PlatformCommerceSubscriptionListOut,
)
from src.modules.commerce.schema import WorkspaceCommerceOverviewOut
from src.modules.platform_identity.http import get_current_platform_session
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


def _overview() -> WorkspaceCommerceOverviewOut:
    now = datetime.now(UTC)
    period_end = now + timedelta(days=30)
    return WorkspaceCommerceOverviewOut.model_validate({
        "billing_provider": "disabled",
        "plan_revision": {
            "id": uuid4(),
            "created_at": now,
            "updated_at": now,
            "plan_id": uuid4(),
            "plan_code": "free",
            "sequence": 1,
            "name_i18n_key": "PLAN_DEFAULT_FREE_NAME",
            "description_i18n_key": "PLAN_DEFAULT_FREE_DESCRIPTION",
            "credit_grant_amount": 70,
            "credit_refresh_interval": "daily",
            "credit_value_micros": 1_000,
            "currency": "USD",
            "prices": [
                {
                    "provider": "stripe",
                    "provider_mode": "test",
                    "billing_cycle": "monthly",
                    "currency": "USD",
                    "amount_micros": 1_000_000,
                },
                {
                    "provider": "stripe",
                    "provider_mode": "test",
                    "billing_cycle": "yearly",
                    "currency": "USD",
                    "amount_micros": 10_000_000,
                },
            ],
            "resource_allowances": [{"key": "projects.active", "limit_kind": "limited", "limit_value": 3}],
            "entitlements": [
                {
                    "key": "sites.generate",
                    "is_included": True,
                    "allocation_mode": "workspace",
                    "seat_limit_kind": None,
                    "seat_limit_value": None,
                }
            ],
            "is_selling": True,
        },
        "subscription": {
            "id": uuid4(),
            "created_at": now,
            "updated_at": now,
            "plan_revision_id": uuid4(),
            "subscription_revision": 1,
            "status": "active",
            "billing_cycle": "monthly",
            "current_period_start": now,
            "current_period_end": period_end,
            "cancel_at_period_end": False,
        },
        "credits": {
            "balance": 70,
            "reserved": 2,
            "available": 68,
            "period_start": now,
            "period_end": period_end,
            "next_refresh_at": period_end,
        },
        "usage": {
            "period_cost_micros": 25_000,
            "requests": 4,
            "prompt_tokens": 120,
            "completion_tokens": 48,
        },
    })


async def test_system_operator_can_read_workspace_commerce_overview(monkeypatch) -> None:
    workspace_id = uuid4()
    overview = _overview()
    get_overview = AsyncMock(return_value=overview)
    service = SimpleNamespace(get_overview=get_overview)
    monkeypatch.setattr(system_router, "build_commerce_service", lambda _settings: service)

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)

    app = FastAPI()
    app.include_router(system_router.router, prefix="/platform-api/v1/commerce")
    app.dependency_overrides[get_current_platform_session] = _platform_owner

    async with asgi_client(app) as client:
        response = await client.get(f"/platform-api/v1/commerce/workspaces/{encode_uuid(workspace_id)}/overview")

    assert response.status_code == 200
    assert response.json()["data"]["planRevision"]["planCode"] == "free"
    assert response.json()["data"]["credits"]["available"] == 68
    get_overview.assert_awaited_once_with(workspace_id=workspace_id)


async def test_system_operator_can_read_platform_commerce_catalog_and_subscriptions(monkeypatch) -> None:
    now = datetime.now(UTC)
    plan_id = uuid4()
    revision_id = uuid4()
    workspace_id = uuid4()
    subscription_id = uuid4()
    catalog = PlatformCommercePlanCatalogOut(
        items=(
            {
                "id": plan_id,
                "code": "premium",
                "is_active": True,
                "sort_order": 10,
                "revisions": (
                    PlatformCommerceRevisionSummaryOut(
                        id=revision_id,
                        sequence=2,
                        status=PlanRevisionStatus.PUBLISHED,
                        is_selling=True,
                        name_i18n_key="PLAN_PREMIUM_NAME",
                        description_i18n_key="PLAN_PREMIUM_DESCRIPTION",
                        published_at=now,
                    ),
                ),
            },
        ),
    )
    subscriptions = PlatformCommerceSubscriptionListOut(
        total=1,
        items=(
            {
                "workspace_id": workspace_id,
                "subscription_id": subscription_id,
                "plan_revision_id": revision_id,
                "plan_code": "premium",
                "plan_revision": 2,
                "status": SubscriptionStatus.ACTIVE,
                "billing_cycle": BillingCycle.MONTHLY,
                "current_period_start": now,
                "current_period_end": now + timedelta(days=30),
                "cancel_at_period_end": False,
                "billing_provider": "stripe",
            },
        ),
    )
    service = SimpleNamespace(
        list_plan_catalog=AsyncMock(return_value=catalog),
        list_plan_revisions=AsyncMock(return_value=catalog.items[0].revisions),
        list_subscriptions=AsyncMock(return_value=subscriptions),
    )
    monkeypatch.setattr(system_router, "build_platform_commerce_read_service", lambda: service)

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)

    app = FastAPI()
    app.include_router(system_router.router, prefix="/platform-api/v1/commerce")
    app.dependency_overrides[get_current_platform_session] = _platform_owner

    async with asgi_client(app) as client:
        plans_response = await client.get("/platform-api/v1/commerce/plans?includeInactive=true")
        revisions_response = await client.get("/platform-api/v1/commerce/plans/premium/revisions")
        subscriptions_response = await client.get(
            "/platform-api/v1/commerce/subscriptions?page=2&pageSize=25&status=active&provider=stripe"
        )

    assert plans_response.status_code == 200
    assert plans_response.json()["data"]["items"][0]["revisions"][0]["sequence"] == 2
    assert revisions_response.status_code == 200
    assert revisions_response.json()["data"][0]["nameI18NKey"] == "PLAN_PREMIUM_NAME"
    assert subscriptions_response.status_code == 200
    assert subscriptions_response.json()["data"]["items"][0]["workspaceId"] == encode_uuid(workspace_id)
    service.list_plan_catalog.assert_awaited_once_with(include_inactive=True)
    service.list_plan_revisions.assert_awaited_once_with(code="premium", include_inactive=False)
    query = service.list_subscriptions.await_args.kwargs["query"]
    assert query.page == 2
    assert query.page_size == 25
    assert query.status == SubscriptionStatus.ACTIVE
    assert query.provider == "stripe"
