from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.user import User
from src.modules.auth.tokens.service import decode_token

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_system_bootstrap_requires_onboarding_workspace_choice_after_registering_admin(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    base_settings = get_settings()
    settings = base_settings.model_copy(deep=True)
    settings.application.data_dir = tmp_path

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/system/setup/bootstrap",
                json={
                    "username": "founder01",
                    "email": "founder@example.com",
                    "display_name": "Founder",
                    "password": "bootstrap123",
                },
            )

            assert response.status_code == 200
            tokens = response.json()["data"]
            assert tokens["accessToken"]
            assert tokens["refreshToken"]
            access_payload = decode_token(tokens["accessToken"], settings.auth)
            assert access_payload["typ"] == "access"
            assert settings.application.data_dir.joinpath("install.lock").exists() is True

            super_admin_count = await User.filter(is_super_admin=True).count()
            assert super_admin_count == 1

            runtime_response = await client.get("/api/v1/system/runtime")
            assert runtime_response.status_code == 200
            assert runtime_response.json()["data"]["instanceSetup"]["status"] == "ready"

            workspace_response = await client.get(
                "/api/v1/me/workspaces",
                headers={"Authorization": f"Bearer {tokens['accessToken']}"},
            )
            assert workspace_response.status_code == 200
            workspace_payload = workspace_response.json()["data"]
            assert workspace_payload["items"] == []
            assert workspace_payload["onboarding"]["status"] == "pending_workspace"
            assert workspace_payload["onboarding"]["workspaceId"] is None
            assert workspace_payload["switcher"]["personalSpace"]["status"] == "pending"
            assert workspace_payload["switcher"]["personalSpace"]["workspace"] is None
            assert workspace_payload["switcher"]["teams"] == []

    app.dependency_overrides.clear()
