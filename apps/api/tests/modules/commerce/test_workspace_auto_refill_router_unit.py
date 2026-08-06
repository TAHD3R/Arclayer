from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi import FastAPI

from src.common.utils.public_ids import encode_uuid
from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.registries import ConnectorRegistry
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import CommerceAutoRefillExecutionState
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.authorization import require_workspace_commerce_manage_access
from src.modules.commerce.auto_refill_schema import (
    AutoRefillLifecycleAction,
    WorkspaceAutoRefillLifecycleOut,
    WorkspaceAutoRefillPolicyOut,
    WorkspaceAutoRefillPolicyWrite,
)
from src.modules.commerce.workspace_router import router
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext
from tests.utils.asgi_client import asgi_client


class _Service:
    def __init__(self, result: WorkspaceAutoRefillPolicyOut) -> None:
        self.result = result
        self.calls: list[dict[str, object]] = []

    async def get(self, **kwargs: object) -> WorkspaceAutoRefillPolicyOut:
        self.calls.append(kwargs)
        return self.result

    async def update(self, **kwargs: object) -> WorkspaceAutoRefillPolicyOut:
        self.calls.append(kwargs)
        return self.result

    async def get_lifecycle(self, **kwargs: object) -> WorkspaceAutoRefillLifecycleOut:
        self.calls.append(kwargs)
        return WorkspaceAutoRefillLifecycleOut(
            workspace_id=self.result.workspace_id,
            policy_revision=self.result.revision,
            execution_state=CommerceAutoRefillExecutionState.UNAVAILABLE,
            trigger_below_credits=self.result.trigger_below_credits,
            available_credits=10,
            threshold_reached=True,
            action=AutoRefillLifecycleAction.PROVIDER_CHARGE_REQUIRED,
        )


def _context(workspace_id) -> WorkspaceContext:  # type: ignore[no-untyped-def]
    return WorkspaceContext(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        access_type=WorkspaceAccessType.MEMBER,
        workspace_membership_id=uuid4(),
        is_workspace_owner=True,
    )


@pytest.mark.asyncio
async def test_auto_refill_routes_preserve_workspace_and_revisioned_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_id = uuid4()
    actor_user_id = uuid4()
    offer_id = uuid4()
    result = WorkspaceAutoRefillPolicyOut(
        workspace_id=workspace_id,
        configured=True,
        offer_id=offer_id,
        offer_code="credits-100",
        offer_revision=3,
        credit_amount=100,
        is_enabled=False,
        trigger_below_credits=25,
        monthly_ceiling_micros=10_000_000,
        currency="USD",
        provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        execution_state=CommerceAutoRefillExecutionState.DISABLED,
        revision=4,
    )
    service = _Service(result)
    monkeypatch.setattr(
        "src.modules.commerce.workspace_router.build_auto_refill_service",
        lambda _settings, _registry: service,
    )
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[require_workspace_commerce_manage_access] = lambda: _context(workspace_id)
    app.dependency_overrides[get_current_user_id] = lambda: actor_user_id
    app.dependency_overrides[get_settings] = lambda: cast(Settings, SimpleNamespace())
    app.dependency_overrides[get_connector_registry] = lambda: cast(ConnectorRegistry, SimpleNamespace())

    async with asgi_client(app) as client:
        get_response = await client.get(f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/auto-refill")
        put_response = await client.put(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/auto-refill",
            json={
                "offerId": encode_uuid(offer_id),
                "isEnabled": False,
                "triggerBelowCredits": 25,
                "monthlyCeilingMicros": 10_000_000,
                "currency": "USD",
                "expectedRevision": 3,
                "idempotencyKey": "auto-refill-route-1",
            },
        )
        lifecycle_response = await client.get(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/auto-refill/lifecycle"
        )

    assert get_response.status_code == 200
    assert put_response.status_code == 200
    assert lifecycle_response.status_code == 200
    assert lifecycle_response.json()["data"]["action"] == "provider_charge_required"
    assert service.calls[0] == {"workspace_id": workspace_id}
    update_call = service.calls[1]
    assert update_call["workspace_id"] == workspace_id
    assert update_call["actor_user_id"] == actor_user_id
    command = cast(WorkspaceAutoRefillPolicyWrite, update_call["command"])
    assert command.expected_revision == 3
    assert service.calls[2] == {"workspace_id": workspace_id}
