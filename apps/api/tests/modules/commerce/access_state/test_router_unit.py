from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI

from src.common.utils.public_ids import encode_uuid
from src.modules.commerce.access_state import router
from src.modules.commerce.access_state.composition import build_commercial_access_state_reader
from src.modules.commerce.access_state.schema import (
    CommercialAccessMemberView,
    CommercialAccessRecoveryView,
    CommercialAccessState,
)
from src.modules.commerce.authorization import require_workspace_commerce_manage_access
from src.modules.workspaces.http.service import require_workspace_member_access
from tests.utils.asgi_client import asgi_client


def _app(*, workspace_id, reader: object, member_context: object, billing_context: object) -> FastAPI:
    app = FastAPI()
    app.include_router(router.router, prefix="/api/v1")
    app.dependency_overrides[build_commercial_access_state_reader] = lambda: reader
    app.dependency_overrides[require_workspace_member_access] = lambda: member_context
    app.dependency_overrides[require_workspace_commerce_manage_access] = lambda: billing_context
    return app


@pytest.mark.asyncio
async def test_member_access_route_returns_sanitized_restricted_state() -> None:
    workspace_id = uuid4()
    reader = SimpleNamespace(
        member_view=AsyncMock(
            return_value=CommercialAccessMemberView(
                workspace_id=workspace_id,
                state=CommercialAccessState.PAYMENT_RESTRICTED,
                explanation_key="commerce:PAYMENT_RESTRICTED",
                billing_contact_required=True,
            )
        ),
    )

    async with asgi_client(
        _app(
            workspace_id=workspace_id,
            reader=reader,
            member_context=SimpleNamespace(workspace_id=workspace_id),
            billing_context=SimpleNamespace(workspace_id=workspace_id),
        )
    ) as client:
        response = await client.get(f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/access")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data == {
        "workspaceId": encode_uuid(workspace_id),
        "state": "payment_restricted",
        "explanationKey": "commerce:PAYMENT_RESTRICTED",
        "billingContactRequired": True,
    }
    assert "recoveryDeadline" not in data
    assert "permittedRecoveryAction" not in data


@pytest.mark.asyncio
async def test_billing_contact_recovery_route_exposes_action_and_grace_deadline() -> None:
    workspace_id = uuid4()
    deadline = datetime(2026, 8, 5, tzinfo=UTC)
    reader = SimpleNamespace(
        recovery_view=AsyncMock(
            return_value=CommercialAccessRecoveryView(
                workspace_id=workspace_id,
                state=CommercialAccessState.PAYMENT_GRACE,
                recovery_deadline=deadline,
                permitted_recovery_action="open_payment_recovery",
            )
        ),
    )

    async with asgi_client(
        _app(
            workspace_id=workspace_id,
            reader=reader,
            member_context=SimpleNamespace(workspace_id=workspace_id),
            billing_context=SimpleNamespace(workspace_id=workspace_id),
        )
    ) as client:
        response = await client.get(f"/api/v1/workspaces/{encode_uuid(workspace_id)}/commerce/payment-recovery")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["state"] == "payment_grace"
    assert data["recoveryDeadline"].startswith("2026-08-05T00:00:00")
    assert data["permittedRecoveryAction"] == "open_payment_recovery"
