from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, ConfigDict

from src.common.utils.public_ids import encode_uuid
from src.models.analytics.audit_event import AuditEvent
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.router import router as system_router

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_system_activity_list_returns_events(db_schema) -> None:
    org_id = uuid4()
    other_org_id = uuid4()
    user_id = uuid4()

    # Insert audit events in two orgs to prove the system route is instance-scoped.
    # Note: db_schema fixture already generated schemas.
    await AuditEvent.create(
        occurred_at=datetime.now(UTC),
        event_name="auth.login.succeeded",
        organization_id=org_id,
        actor_user_id=user_id,
        properties={"ip": "127.0.0.1"},
    )
    await AuditEvent.create(
        occurred_at=datetime.now(UTC),
        event_name="system.settings.updated",
        organization_id=other_org_id,
        actor_user_id=user_id,
        properties={"namespace": "core"},
    )

    class DummyUser(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        id: UUID
        is_super_admin: bool = True

    async def _super_admin_override() -> DummyUser:
        return DummyUser(id=user_id)

    app = FastAPI()
    app.include_router(system_router, prefix="/api/v1/system")
    app.dependency_overrides[require_super_admin] = _super_admin_override
    app.dependency_overrides[get_current_user] = _super_admin_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/system/activity?page=1&size=20")
    assert res.status_code == 200

    payload = res.json()
    assert payload.get("error") is None
    data = payload.get("data") or {}
    items = data.get("items") or []
    assert len(items) == 2
    assert {item.get("eventName") for item in items} == {
        "auth.login.succeeded",
        "system.settings.updated",
    }
    assert {item.get("organizationId") for item in items} == {
        encode_uuid(org_id),
        encode_uuid(other_org_id),
    }
