from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, ConfigDict

from src.common.utils.public_ids import encode_uuid
from src.models.analytics.audit_event import AuditEvent
from src.modules.analytics.workspaces.router import router as workspace_activity_router
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.router import router as system_router
from src.modules.workspaces.http.service import require_workspace_manage_access

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


@pytest.mark.asyncio
async def test_system_activity_supports_organization_filter_and_pagination(db_schema) -> None:
    org_id = uuid4()
    other_org_id = uuid4()
    user_id = uuid4()
    base_time = datetime.now(UTC)

    first = await AuditEvent.create(
        occurred_at=base_time - timedelta(minutes=2),
        event_name="workspace.member.invited",
        organization_id=org_id,
        actor_user_id=user_id,
        properties={"seq": 1},
    )
    second = await AuditEvent.create(
        occurred_at=base_time - timedelta(minutes=1),
        event_name="workspace.member.invited",
        organization_id=org_id,
        actor_user_id=user_id,
        properties={"seq": 2},
    )
    await AuditEvent.create(
        occurred_at=base_time,
        event_name="workspace.member.invited",
        organization_id=other_org_id,
        actor_user_id=user_id,
        properties={"seq": 99},
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
        res = await client.get(
            "/api/v1/system/activity",
            params={
                "organizationId": encode_uuid(org_id),
                "eventName": "workspace.member.invited",
                "occurredFrom": (base_time - timedelta(minutes=3)).isoformat(),
                "occurredTo": (base_time + timedelta(minutes=1)).isoformat(),
                "page": 1,
                "size": 1,
            },
        )
        assert res.status_code == 200, res.text
        payload = res.json()["data"]
        assert payload["total"] == 2
        assert payload["pages"] == 2
        assert payload["next"] == 2
        assert payload["prev"] is None
        assert payload["items"][0]["organizationId"] == encode_uuid(org_id)
        assert payload["items"][0]["properties"]["seq"] == 2

        res_next = await client.get(
            "/api/v1/system/activity",
            params={
                "organizationId": encode_uuid(org_id),
                "eventName": "workspace.member.invited",
                "occurredFrom": (base_time - timedelta(minutes=3)).isoformat(),
                "occurredTo": (base_time + timedelta(minutes=1)).isoformat(),
                "page": 2,
                "size": 1,
            },
        )
        assert res_next.status_code == 200, res_next.text
        next_payload = res_next.json()["data"]
        assert next_payload["total"] == 2
        assert next_payload["pages"] == 2
        assert next_payload["next"] is None
        assert next_payload["prev"] == 1
        assert next_payload["items"][0]["id"] == encode_uuid(first.id)


@pytest.mark.asyncio
async def test_system_activity_empty_result_and_descending_order(db_schema) -> None:
    org_id = uuid4()
    user_id = uuid4()
    base_time = datetime.now(UTC)
    first = await AuditEvent.create(
        id=UUID("00000000-0000-0000-0000-000000000001"),
        occurred_at=base_time - timedelta(seconds=2),
        event_name="system.mail.updated",
        organization_id=org_id,
        actor_user_id=user_id,
        properties={"seq": 1},
    )
    second = await AuditEvent.create(
        id=UUID("00000000-0000-0000-0000-000000000002"),
        occurred_at=base_time - timedelta(seconds=2),
        event_name="system.mail.updated",
        organization_id=org_id,
        actor_user_id=user_id,
        properties={"seq": 2},
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
        res = await client.get(
            "/api/v1/system/activity",
            params={
                "organizationId": encode_uuid(org_id),
                "eventName": "system.mail.updated",
                "occurredFrom": (base_time - timedelta(minutes=1)).isoformat(),
                "occurredTo": (base_time + timedelta(minutes=1)).isoformat(),
                "page": 1,
                "size": 10,
            },
        )
        assert res.status_code == 200, res.text
        payload = res.json()["data"]
        assert payload["total"] == 2
        assert [item["properties"]["seq"] for item in payload["items"]] == [2, 1]
        assert payload["next"] is None
        assert payload["prev"] is None
        assert payload["pages"] == 1

        empty = await client.get(
            "/api/v1/system/activity",
            params={
                "organizationId": encode_uuid(other_org_id := uuid4()),
                "page": 1,
                "size": 10,
            },
        )
        assert empty.status_code == 200, empty.text
        empty_payload = empty.json()["data"]
        assert empty_payload["total"] == 0
        assert empty_payload["items"] == []


@pytest.mark.asyncio
async def test_workspace_activity_route_enforces_workspace_scope(db_schema) -> None:
    org_id = uuid4()
    workspace_id = uuid4()
    other_workspace_id = uuid4()
    user_id = uuid4()

    await AuditEvent.create(
        occurred_at=datetime.now(UTC),
        event_name="workspace.member.invited",
        organization_id=org_id,
        workspace_id=workspace_id,
        actor_user_id=user_id,
        properties={"seq": 1},
    )
    await AuditEvent.create(
        occurred_at=datetime.now(UTC),
        event_name="workspace.member.invited",
        organization_id=org_id,
        workspace_id=other_workspace_id,
        actor_user_id=user_id,
        properties={"seq": 2},
    )

    class DummyWorkspaceContext(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        organization_id: UUID
        workspace_id: UUID

    async def _workspace_access_override() -> DummyWorkspaceContext:
        return DummyWorkspaceContext(organization_id=org_id, workspace_id=workspace_id)

    class DummyUser(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        id: UUID
        is_super_admin: bool = True

    async def _super_admin_override() -> DummyUser:
        return DummyUser(id=user_id)

    app = FastAPI()
    app.include_router(workspace_activity_router, prefix="/api/v1")
    app.dependency_overrides[require_workspace_manage_access] = _workspace_access_override
    app.dependency_overrides[require_super_admin] = _super_admin_override
    app.dependency_overrides[get_current_user] = _super_admin_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/workspaces/{encode_uuid(workspace_id)}/activity",
            params={
                "workspaceId": encode_uuid(other_workspace_id),
                "organizationId": encode_uuid(org_id),
                "page": 1,
                "size": 10,
            },
        )
        assert res.status_code == 200, res.text
        payload = res.json()["data"]
        assert payload["total"] == 1
        assert payload["items"][0]["workspaceId"] == encode_uuid(workspace_id)
