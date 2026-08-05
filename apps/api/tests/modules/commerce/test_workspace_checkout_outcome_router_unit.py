from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi import FastAPI

from src.common.utils.public_ids import encode_uuid
from src.config import Settings, get_settings
from src.core.exceptions.handlers import init_exception_handlers
from src.core.extensions.dependencies import get_connector_registry
from src.core.registries import ConnectorRegistry
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.authorization import require_workspace_commerce_manage_access
from src.modules.commerce.simulated_checkout_outcome_service import (
    SimulatedCheckoutOutcomeOut,
    SimulatedCheckoutOutcomeWrite,
)
from src.modules.commerce.workspace_router import router
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext
from tests.utils.asgi_client import asgi_client


class _Service:
    def __init__(self, result: SimulatedCheckoutOutcomeOut) -> None:
        self.result = result
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs: object) -> SimulatedCheckoutOutcomeOut:
        self.calls.append(kwargs)
        return self.result


def _context(workspace_id, membership_id) -> WorkspaceContext:  # type: ignore[no-untyped-def]
    return WorkspaceContext(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        access_type=WorkspaceAccessType.MEMBER,
        workspace_membership_id=membership_id,
        is_workspace_owner=True,
    )


@pytest.mark.asyncio
async def test_workspace_checkout_outcome_route_preserves_header_body_actor_and_public_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    checkout_id = uuid4()
    actor_user_id = uuid4()
    inbox_id = uuid4()
    job_id = uuid4()
    service = _Service(
        SimulatedCheckoutOutcomeOut(
            checkout_session_id=checkout_id,
            outcome="succeeded",
            provider_event_id="sim_evt_route",
            accepted=True,
            event_created=True,
            inbox_id=inbox_id,
            job_id=job_id,
        )
    )
    monkeypatch.setattr(
        "src.modules.commerce.workspace_router.build_simulated_checkout_outcome_service",
        lambda _settings, _registry: service,
    )
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[require_workspace_commerce_manage_access] = lambda: _context(workspace_id, uuid4())
    app.dependency_overrides[get_current_user_id] = lambda: actor_user_id
    app.dependency_overrides[get_settings] = lambda: cast(Settings, SimpleNamespace())
    app.dependency_overrides[get_connector_registry] = lambda: cast(ConnectorRegistry, SimpleNamespace())

    async with asgi_client(app) as client:
        response = await client.post(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/checkout-session/{encode_uuid(checkout_id)}/outcome",
            headers={"Idempotency-Key": "route-outcome-1"},
            json={"outcome": "succeeded", "expectedRevision": 1},
        )

    assert response.status_code == 200
    assert response.json()["data"] == {
        "checkoutSessionId": encode_uuid(checkout_id),
        "outcome": "succeeded",
        "providerEventId": "sim_evt_route",
        "accepted": True,
        "eventCreated": True,
        "inboxId": encode_uuid(inbox_id),
        "jobId": encode_uuid(job_id),
    }
    assert service.calls == [
        {
            "workspace_id": workspace_id,
            "checkout_session_id": checkout_id,
            "actor_user_id": actor_user_id,
            "idempotency_key": "route-outcome-1",
            "payload": service.calls[0]["payload"],
        }
    ]
    payload = cast(SimulatedCheckoutOutcomeWrite, service.calls[0]["payload"])
    assert payload.outcome == "succeeded"
    assert payload.expected_revision == 1


@pytest.mark.asyncio
async def test_workspace_checkout_outcome_route_requires_idempotency_header() -> None:
    workspace_id = uuid4()
    checkout_id = uuid4()
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[require_workspace_commerce_manage_access] = lambda: _context(workspace_id, uuid4())
    app.dependency_overrides[get_current_user_id] = lambda: uuid4()
    app.dependency_overrides[get_settings] = lambda: cast(Settings, SimpleNamespace())
    app.dependency_overrides[get_connector_registry] = lambda: cast(ConnectorRegistry, SimpleNamespace())

    async with asgi_client(app) as client:
        response = await client.post(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/checkout-session/{encode_uuid(checkout_id)}/outcome",
            json={"outcome": "pending", "expectedRevision": 1},
        )

    assert response.status_code == 422
