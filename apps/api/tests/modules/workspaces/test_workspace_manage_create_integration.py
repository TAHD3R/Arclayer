from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password

pytestmark = pytest.mark.integration

_CSRF_ORIGIN = "http://testserver"


async def _csrf_headers(client: AsyncClient) -> dict[str, str]:
    await client.get("/api/v1/system/runtime")
    token = client.cookies.get("csrf_token")
    assert token is not None
    return {"Origin": _CSRF_ORIGIN, "X-CSRF-Token": token}


async def test_manage_workspace_create_returns_persisted_workspace_without_kind(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await UserRepository().create_user(
            username=f"workspace_owner_{uuid4().hex[:10]}",
            email=f"workspace_owner_{uuid4().hex[:10]}@example.com",
            display_name="Workspace Owner",
            password_hash=hash_password("workspace_owner_password_123", settings.auth),
        )

        async def _get_user() -> User:
            return owner

        async def _get_user_id():
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(
            transport=transport,
            base_url=_CSRF_ORIGIN,
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            response = await client.post(
                "/api/v1/workspaces",
                json={
                    "name": "Managed Workspace",
                    "description": "Created through the management route.",
                    "template": "blank",
                },
                headers=await _csrf_headers(client),
            )

        assert response.status_code == 200, response.text
        data = response.json()["data"]
        workspace = await Workspace.get(name="Managed Workspace", created_by_user_id=owner.id)
        organization = await Organization.get(id=workspace.organization_id)
        app.dependency_overrides.clear()

    assert data["name"] == "Managed Workspace"
    assert data["description"] == "Created through the management route."
    assert "kind" not in data

    assert workspace.name == "Managed Workspace"
    assert organization.owner_user_id == owner.id
