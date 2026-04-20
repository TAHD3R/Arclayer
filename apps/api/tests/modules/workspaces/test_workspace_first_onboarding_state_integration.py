from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization, OrganizationKind
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace

pytestmark = pytest.mark.integration


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


@pytest.mark.asyncio
async def test_team_onboarding_flow_creates_team_workspace_then_completes_defaults(
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
            username = f"onboarding-team-{suffix}"
            email = f"{username}@example.com"
            password = "onboarding_pass_123"
            workspace_name = "Founder Team"

            register_response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": username,
                    "email": email,
                    "display_name": "Onboarding User",
                    "password": password,
                },
            )
            assert register_response.status_code == 200, register_response.text

            login_response = await client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": password},
            )
            assert login_response.status_code == 200, login_response.text
            access_token = login_response.json()["data"]["accessToken"]
            headers = _auth_headers(access_token)

            initial_workspaces_resp = await client.get("/api/v1/me/workspaces", headers=headers)
            assert initial_workspaces_resp.status_code == 200, initial_workspaces_resp.text
            initial_payload = initial_workspaces_resp.json()["data"]
            assert initial_payload["items"] == []
            assert initial_payload["onboarding"]["status"] == "pending_workspace"
            assert initial_payload["onboarding"]["workspaceId"] is None
            assert initial_payload["switcher"]["teams"] == []
            assert "personalSpace" not in initial_payload["switcher"]

            create_workspace_resp = await client.post(
                "/api/v1/me/workspaces/onboarding",
                json={
                    "name": workspace_name,
                },
                headers=headers,
            )
            assert create_workspace_resp.status_code == 200, create_workspace_resp.text
            created_workspace = create_workspace_resp.json()["data"]
            workspace_id = created_workspace["workspaceId"]
            assert "projectId" not in created_workspace

            post_create_workspaces_resp = await client.get("/api/v1/me/workspaces", headers=headers)
            assert post_create_workspaces_resp.status_code == 200, post_create_workspaces_resp.text
            post_create_payload = post_create_workspaces_resp.json()["data"]
            assert len(post_create_payload["items"]) == 1
            team_workspace = post_create_payload["items"][0]
            assert team_workspace["workspaceId"] == workspace_id
            assert team_workspace["kind"] == "team"
            assert team_workspace["name"] == workspace_name
            assert post_create_payload["onboarding"]["status"] == "pending_workspace_defaults"
            assert post_create_payload["onboarding"]["workspaceId"] == workspace_id
            assert post_create_payload["switcher"]["teams"][0]["workspaceId"] == workspace_id
            assert "personalSpace" not in post_create_payload["switcher"]

            patch_defaults_resp = await client.patch(
                f"/api/v1/workspaces/{workspace_id}/settings/core",
                json={
                    "patch": {
                        "workspace_localization": {
                            "locale": "en-US",
                            "timezone": "Asia/Shanghai",
                            "use_browser_timezone": False,
                            "date_format": "YYYY-MM-DD",
                            "use_relative_datetime": True,
                        }
                    }
                },
                headers=headers,
            )
            assert patch_defaults_resp.status_code == 200, patch_defaults_resp.text

            completed_workspaces_resp = await client.get("/api/v1/me/workspaces", headers=headers)
            assert completed_workspaces_resp.status_code == 200, completed_workspaces_resp.text
            completed_payload = completed_workspaces_resp.json()["data"]
            assert completed_payload["onboarding"]["status"] == "completed"
            assert completed_payload["onboarding"]["workspaceId"] == workspace_id
            assert completed_payload["switcher"]["teams"][0]["workspaceId"] == workspace_id
            assert "personalSpace" not in completed_payload["switcher"]


@pytest.mark.asyncio
async def test_completed_onboarding_reuses_existing_team_workspace_in_response(
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
            username = f"onboarding-team-{suffix}"
            email = f"{username}@example.com"
            password = "onboarding_pass_123"

            register_response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": username,
                    "email": email,
                    "display_name": "Team Owner",
                    "password": password,
                },
            )
            assert register_response.status_code == 200, register_response.text

            login_response = await client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": password},
            )
            assert login_response.status_code == 200, login_response.text
            access_token = login_response.json()["data"]["accessToken"]
            headers = _auth_headers(access_token)

            create_workspace_resp = await client.post(
                "/api/v1/me/workspaces/onboarding",
                json={
                    "name": "Blog Team",
                },
                headers=headers,
            )
            assert create_workspace_resp.status_code == 200, create_workspace_resp.text
            created_workspace = create_workspace_resp.json()["data"]
            workspace_id = created_workspace["workspaceId"]
            assert "projectId" not in created_workspace

            post_create_workspaces_resp = await client.get("/api/v1/me/workspaces", headers=headers)
            assert post_create_workspaces_resp.status_code == 200, post_create_workspaces_resp.text
            post_create_payload = post_create_workspaces_resp.json()["data"]
            assert len(post_create_payload["items"]) == 1
            team_workspace = post_create_payload["items"][0]
            assert team_workspace["workspaceId"] == workspace_id
            assert team_workspace["kind"] == "team"
            assert post_create_payload["onboarding"]["status"] == "pending_workspace_defaults"
            assert post_create_payload["onboarding"]["workspaceId"] == workspace_id
            assert post_create_payload["switcher"]["teams"][0]["workspaceId"] == workspace_id
            assert "personalSpace" not in post_create_payload["switcher"]

            patch_defaults_resp = await client.patch(
                f"/api/v1/workspaces/{workspace_id}/settings/core",
                json={
                    "patch": {
                        "workspace_localization": {
                            "locale": "en-US",
                            "timezone": "Asia/Shanghai",
                            "use_browser_timezone": False,
                            "date_format": "YYYY-MM-DD",
                            "use_relative_datetime": True,
                        }
                    }
                },
                headers=headers,
            )
            assert patch_defaults_resp.status_code == 200, patch_defaults_resp.text

            completed_workspaces_resp = await client.get("/api/v1/me/workspaces", headers=headers)
            assert completed_workspaces_resp.status_code == 200, completed_workspaces_resp.text
            completed_payload = completed_workspaces_resp.json()["data"]
            assert completed_payload["onboarding"]["status"] == "completed"
            assert completed_payload["onboarding"]["workspaceId"] == workspace_id
            assert completed_payload["switcher"]["teams"][0]["workspaceId"] == workspace_id
            assert "personalSpace" not in completed_payload["switcher"]

            repeated_create_resp = await client.post(
                "/api/v1/me/workspaces/onboarding",
                json={"name": "Ignored", "slug": f"ignored-{suffix}"},
                headers=headers,
            )
            assert repeated_create_resp.status_code == 400, repeated_create_resp.text
            assert repeated_create_resp.json()["error"] == "WORKSPACE_ONBOARDING_COMPLETED"


@pytest.mark.asyncio
async def test_onboarding_workspace_creation_allows_existing_workspace_in_team_org(
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
            username = f"onboarding-existing-{suffix}"
            email = f"{username}@example.com"
            password = "onboarding_pass_123"

            register_response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": username,
                    "email": email,
                    "display_name": "Existing Workspace User",
                    "password": password,
                },
            )
            assert register_response.status_code == 200, register_response.text

            login_response = await client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": password},
            )
            assert login_response.status_code == 200, login_response.text
            access_token = login_response.json()["data"]["accessToken"]
            headers = _auth_headers(access_token)

            user = await User.get(email=email)

            team_org = await Organization.create(
                slug=f"existing-team-org-{suffix}",
                name="Existing Team Org",
                kind=OrganizationKind.TEAM,
                owner_user_id=user.id,
                is_active=True,
            )
            await OrgMembership.create(
                organization_id=team_org.id,
                user_id=user.id,
                role=OrgRole.OWNER,
                role_code=OrgRole.OWNER.value,
                status="active",
            )
            await Workspace.create(
                organization_id=team_org.id,
                name="Preexisting Workspace",
                is_active=True,
                created_by_user_id=user.id,
            )

            create_workspace_resp = await client.post(
                "/api/v1/me/workspaces/onboarding",
                json={"name": "Founder Team"},
                headers=headers,
            )
            assert create_workspace_resp.status_code == 200, create_workspace_resp.text
            created_workspace = create_workspace_resp.json()["data"]
            assert created_workspace["workspaceId"]
            assert "projectId" not in created_workspace

            post_create_workspaces_resp = await client.get("/api/v1/me/workspaces", headers=headers)
            assert post_create_workspaces_resp.status_code == 200, post_create_workspaces_resp.text
            post_create_payload = post_create_workspaces_resp.json()["data"]
            assert post_create_payload["onboarding"]["status"] == "pending_workspace_defaults"
            assert post_create_payload["onboarding"]["workspaceId"] == created_workspace["workspaceId"]
            assert len(post_create_payload["items"]) == 2
