from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI

from src.common.utils.public_ids import encode_uuid
from src.modules.auth.http.service import require_super_admin
from src.modules.commerce import system_router
from src.modules.commerce.schema import WorkspaceCommerceOverviewOut
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


def _overview() -> WorkspaceCommerceOverviewOut:
    now = datetime.now(UTC)
    period_end = now + timedelta(days=30)
    return WorkspaceCommerceOverviewOut.model_validate({
        "billing_provider": "disabled",
        "checkout_enabled": False,
        "plan": {
            "id": uuid4(),
            "created_at": now,
            "updated_at": now,
            "code": "free",
            "tier": "free",
            "name": "Free",
            "description": "Free workspace plan",
            "credit_grant_amount": 70,
            "credit_refresh_interval": "daily",
            "credit_value_micros": 1_000,
            "price_monthly_micros": 0,
            "price_yearly_micros": 0,
            "currency": "USD",
            "features": [],
            "is_active": True,
            "is_default": True,
            "sort_order": 10,
        },
        "subscription": {
            "id": uuid4(),
            "created_at": now,
            "updated_at": now,
            "status": "active",
            "billing_interval": "monthly",
            "current_period_start": now,
            "current_period_end": period_end,
            "cancel_at_period_end": False,
        },
        "credits": {
            "balance": 70,
            "reserved": 2,
            "available": 68,
            "lifetime_granted": 70,
            "lifetime_spent": 0,
            "period_granted": 70,
            "period_spent": 0,
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

    async def _super_admin_override() -> None:
        return None

    app = FastAPI()
    app.include_router(system_router.router, prefix="/api/v1/system/commerce")
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        response = await client.get(f"/api/v1/system/commerce/workspaces/{encode_uuid(workspace_id)}/overview")

    assert response.status_code == 200
    assert response.json()["data"]["plan"]["code"] == "free"
    assert response.json()["data"]["credits"]["available"] == 68
    get_overview.assert_awaited_once_with(workspace_id=workspace_id)
