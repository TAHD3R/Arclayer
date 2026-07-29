from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app

pytestmark = pytest.mark.integration

_CSRF_ORIGIN = "http://testserver"


async def _csrf_headers(client: AsyncClient) -> dict[str, str]:
    await client.get("/api/v1/system/runtime")
    token = client.cookies.get("csrf_token")
    assert token is not None
    return {"Origin": _CSRF_ORIGIN, "X-CSRF-Token": token}


@pytest.mark.asyncio
async def test_public_register_and_login_requires_onboarding_workspace_choice(
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

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            suffix = uuid4().hex[:8]
            username = f"workspace-first-{suffix}"
            email = f"workspace-first-{suffix}@example.com"
            register_response = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": email,
                    "password": "workspace_first_pass_123",
                },
                headers=await _csrf_headers(client),
            )
            assert register_response.status_code == 200, register_response.text
            register_payload = register_response.json()["data"]
            assert register_payload["user"]["username"] == username
            assert register_payload["user"]["displayName"] is None

            login_response = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": email,
                    "password": "workspace_first_pass_123",
                },
                headers=await _csrf_headers(client),
            )
            assert login_response.status_code == 200, login_response.text
            access_token = login_response.json()["data"]["accessToken"]

            workspace_response = await client.get(
                "/api/v1/me/workspaces",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            assert workspace_response.status_code == 200, workspace_response.text
            workspace_payload = workspace_response.json()["data"]
            assert workspace_payload["items"] == []
            assert workspace_payload["onboarding"]["status"] == "pending_workspace"
            assert workspace_payload["onboarding"]["workspaceId"] is None
            assert "switcher" not in workspace_payload


@pytest.mark.asyncio
async def test_public_username_check_reports_generated_username_after_register(
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

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            suffix = uuid4().hex[:8]
            username = f"studio-team-{suffix}"

            available_response = await client.post(
                "/api/v1/auth/username-check",
                json={"username": username},
                headers=await _csrf_headers(client),
            )
            assert available_response.status_code == 200, available_response.text
            assert available_response.json()["data"]["available"] is True

            register_response = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": f"{username}@example.com",
                    "password": "workspace_first_pass_123",
                },
                headers=await _csrf_headers(client),
            )
            assert register_response.status_code == 200, register_response.text
            assert register_response.json()["data"]["user"]["username"] == username

            unavailable_response = await client.post(
                "/api/v1/auth/username-check",
                json={"username": username},
                headers=await _csrf_headers(client),
            )
            assert unavailable_response.status_code == 200, unavailable_response.text
            assert unavailable_response.json()["data"]["available"] is False
