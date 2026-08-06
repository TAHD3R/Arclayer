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
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.authorization import require_workspace_commerce_manage_access
from src.modules.commerce.schema import BillingRedirectOut, TopUpCheckoutSessionCreate
from src.modules.commerce.workspace_router import router
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext
from tests.utils.asgi_client import asgi_client


class _Service:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs: object) -> BillingRedirectOut:
        self.calls.append(kwargs)
        return BillingRedirectOut(url="https://app.example.test/?billingProvider=simulated")


def _context(workspace_id) -> WorkspaceContext:  # type: ignore[no-untyped-def]
    return WorkspaceContext(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        access_type=WorkspaceAccessType.MEMBER,
        workspace_membership_id=uuid4(),
        is_workspace_owner=True,
    )


@pytest.mark.asyncio
async def test_workspace_top_up_checkout_route_preserves_offer_actor_and_idempotency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    actor_user_id = uuid4()
    offer_id = uuid4()
    service = _Service()
    monkeypatch.setattr(
        "src.modules.commerce.workspace_router.build_top_up_checkout_service",
        lambda _settings, _registry: service,
    )
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[require_workspace_commerce_manage_access] = lambda: _context(workspace_id)
    app.dependency_overrides[get_current_user_id] = lambda: actor_user_id
    app.dependency_overrides[get_settings] = lambda: cast(Settings, SimpleNamespace())
    app.dependency_overrides[get_connector_registry] = lambda: cast(ConnectorRegistry, SimpleNamespace())

    async with asgi_client(app) as client:
        response = await client.post(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/top-up-checkout-session",
            headers={"Idempotency-Key": "top-up-route-1"},
            json={"topUpOfferId": encode_uuid(offer_id)},
        )

    assert response.status_code == 200
    assert response.json()["data"] == {"url": "https://app.example.test/?billingProvider=simulated"}
    assert service.calls == [
        {
            "workspace_id": workspace_id,
            "actor_user_id": actor_user_id,
            "idempotency_key": "top-up-route-1",
            "payload": service.calls[0]["payload"],
        }
    ]
    payload = cast(TopUpCheckoutSessionCreate, service.calls[0]["payload"])
    assert payload.top_up_offer_id == offer_id


@pytest.mark.asyncio
async def test_workspace_top_up_checkout_route_requires_idempotency_header() -> None:
    workspace_id = uuid4()
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[require_workspace_commerce_manage_access] = lambda: _context(workspace_id)
    app.dependency_overrides[get_current_user_id] = lambda: uuid4()
    app.dependency_overrides[get_settings] = lambda: cast(Settings, SimpleNamespace())
    app.dependency_overrides[get_connector_registry] = lambda: cast(ConnectorRegistry, SimpleNamespace())

    async with asgi_client(app) as client:
        response = await client.post(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/top-up-checkout-session",
            json={"topUpOfferId": encode_uuid(uuid4())},
        )

    assert response.status_code == 422
