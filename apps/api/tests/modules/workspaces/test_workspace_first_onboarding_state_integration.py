from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.user import User
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.service import AuthService

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_me_workspaces_reports_workspace_first_onboarding_progress(
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

        auth_service = AuthService(settings)
        user = await auth_service.register(
            username=f"onboarding_{uuid4().hex[:8]}",
            email=f"onboarding_{uuid4().hex[:8]}@example.com",
            display_name="Onboarding User",
            password="onboarding_pass_123",
        )

        current_user = cast(User, user)

        async def _get_user() -> User:
            return current_user

        async def _get_user_id() -> UUID:
            return UUID(str(current_user.id))

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            initial_workspaces_resp = await client.get("/api/v1/me/workspaces")
            assert initial_workspaces_resp.status_code == 200, initial_workspaces_resp.text
            initial_payload = initial_workspaces_resp.json()["data"]
            assert initial_payload["items"] == []
            assert initial_payload["onboarding"]["status"] == "pending_workspace"
            assert initial_payload["onboarding"]["workspaceId"] is None

            create_org_resp = await client.post(
                "/api/v1/me/organizations",
                json={"name": "Onboarding Org"},
            )
            assert create_org_resp.status_code == 200, create_org_resp.text

            create_workspace_resp = await client.post(
                "/api/v1/organizations/me/workspaces",
                json={
                    "name": "Blog Team",
                    "slug": "blog-team",
                },
            )
            assert create_workspace_resp.status_code == 200, create_workspace_resp.text
            created_workspace = create_workspace_resp.json()["data"]

            post_create_workspaces_resp = await client.get("/api/v1/me/workspaces")
            assert post_create_workspaces_resp.status_code == 200, post_create_workspaces_resp.text
            post_create_payload = post_create_workspaces_resp.json()["data"]
            assert post_create_payload["onboarding"]["status"] == "pending_workspace_defaults"
            assert post_create_payload["onboarding"]["workspaceId"] == created_workspace["workspaceId"]
            assert post_create_payload["switcher"]["teams"][0]["workspaceId"] == created_workspace["workspaceId"]

            patch_defaults_resp = await client.patch(
                f"/api/v1/workspaces/{created_workspace['workspaceId']}/settings/core",
                json={
                    "patch": {
                        "workspace_localization": {
                            "locale": "en-US",
                            "timezone": "Asia/Shanghai",
                            "use_browser_timezone": False,
                            "date_format": "YYYY-MM-DD",
                            "use_relative_datetime": False,
                        }
                    }
                },
            )
            assert patch_defaults_resp.status_code == 200, patch_defaults_resp.text

            completed_workspaces_resp = await client.get("/api/v1/me/workspaces")
            assert completed_workspaces_resp.status_code == 200, completed_workspaces_resp.text
            completed_payload = completed_workspaces_resp.json()["data"]
            assert completed_payload["onboarding"]["status"] == "completed"
            assert completed_payload["onboarding"]["workspaceId"] == created_workspace["workspaceId"]

        app.dependency_overrides.clear()
