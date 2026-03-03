from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, ConfigDict

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.models.analytics.audit_event import AuditEvent
from apps.api.src.modules.auth.http.service import get_current_user
from apps.api.src.modules.organization.http.service import require_org_admin
from apps.api.src.modules.system.router import router as system_router

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_system_activity_list_returns_events(db_schema) -> None:
    org_id = uuid4()
    user_id = uuid4()

    # Insert one audit event in DB.
    # Note: db_schema fixture already generated schemas.
    await AuditEvent.create(
        occurred_at=datetime.now(UTC),
        event_name="auth.login.succeeded",
        organization_id=org_id,
        actor_user_id=user_id,
        properties={"ip": "127.0.0.1"},
    )

    class DummyOrgMembership(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        organization_id: UUID

    class DummyUser(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        id: UUID

    async def _org_owner_override() -> DummyOrgMembership:
        return DummyOrgMembership(organization_id=org_id)

    async def _user_override() -> DummyUser:
        return DummyUser(id=user_id)

    app = FastAPI()
    app.include_router(system_router, prefix="/api/v1/system")
    app.dependency_overrides[require_org_admin] = _org_owner_override
    app.dependency_overrides[get_current_user] = _user_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/system/activity?page=1&size=20")
    assert res.status_code == 200

    payload = res.json()
    assert payload.get("error") is None
    data = payload.get("data") or {}
    items = data.get("items") or []
    assert len(items) == 1
    assert items[0].get("eventName") == "auth.login.succeeded"
    assert items[0].get("organizationId") == encode_uuid(org_id)
