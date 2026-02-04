from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.database.orm import verify_db_ready
from apps.api.core.registry import create_app
from apps.api.modules.auth.deps import get_current_user, get_current_user_id
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.organization.models.user import User
from apps.api.modules.organization.repository import OrganizationRepository
from apps.api.modules.organization.user_repository import UserRepository
from apps.api.modules.workspaces.models.workspace import Workspace

pytestmark = pytest.mark.integration


def _doc(title: str) -> dict:
    return {
        "version": 1,
        "meta": {"title": {"en-US": title}},
        "blocks": [{"id": "h1", "type": "heading", "props": {"level": 1, "text": {"en-US": title}}}],
    }


@pytest.mark.asyncio
async def test_workspace_site_pages_flow_single_site_model(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        settings = get_settings()
        await verify_db_ready(settings)

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash="x",
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )

        current_user: User | None = owner

        async def _get_user() -> User:
            assert current_user is not None
            return current_user

        async def _get_user_id() -> UUID:
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # Resolve workspace site (auto-create if missing).
            res = await client.get(f"/api/v1/workspaces/{ws.id}/site")
            assert res.status_code == 200, res.text
            site_payload = res.json()["data"]
            site_id = site_payload["siteId"]
            assert isinstance(site_id, str) and site_id

            # Issue a preview token (used by Portal editor mode).
            res2 = await client.post(f"/api/v1/workspaces/{ws.id}/site/preview-tokens", json={"ttlSeconds": 600})
            assert res2.status_code == 201, res2.text
            token_payload = res2.json()["data"]
            assert isinstance(token_payload.get("token"), str)

            # Create a page.
            res3 = await client.post(f"/api/v1/workspaces/{ws.id}/site/pages", json={"path": "/about"})
            assert res3.status_code == 201, res3.text
            page = res3.json()["data"]
            page_id = page["id"]
            assert page["path"] == "/about"

            # Save a draft revision.
            res4 = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/pages/{page_id}/revisions/draft",
                json={"document": _doc("About v1"), "expectedRevision": 0},
            )
            assert res4.status_code == 201, res4.text
            draft = res4.json()["data"]
            assert draft["revision"] == 1

            # Publish the draft.
            res5 = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/pages/{page_id}/revisions/publish",
                json={},
            )
            assert res5.status_code == 200, res5.text

            # Public mode should resolve the page.
            res6 = await client.get(
                f"/api/v1/sites/{site_id}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert res6.status_code == 200, res6.text
            assert res6.json()["data"]["match"]["kind"] == "page"

            # Unpublish (published -> draft-only).
            res7 = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/pages/{page_id}/revisions/unpublish",
                json={},
            )
            assert res7.status_code == 200, res7.text

            # Public mode should treat it as not found after unpublish.
            res8 = await client.get(
                f"/api/v1/sites/{site_id}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert res8.status_code == 200, res8.text
            assert res8.json()["data"]["match"]["kind"] == "not_found"
