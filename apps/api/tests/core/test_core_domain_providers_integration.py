from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.config import get_settings
from apps.api.src.core.registry import create_app
from apps.api.src.modules.auth.http.service import get_current_user, get_current_user_id

pytestmark = pytest.mark.integration


async def test_core_domain_short_paths(prepared_db) -> None:
    _ = prepared_db

    app = create_app()

    transport = ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
        from apps.api.src.models.organization.user import User
        from apps.api.src.models.workspaces.workspace import Workspace
        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.tokens.service import hash_password
        from apps.api.src.modules.organization.repository import OrganizationRepository

        settings = get_settings()
        user_repo = UserRepository()
        org_repo = OrganizationRepository()

        user = await user_repo.create_user(
            username=f"admin_{uuid4().hex}",
            email="owner@example.com",
            display_name="Admin",
            password_hash=hash_password("admin_password_123", settings.auth),
        )
        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        await OrgMembership.create(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=user.id,
        )

        current_user: User | None = user

        async def _fake_user():
            assert current_user is not None
            return current_user

        async def _fake_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _fake_user
        app.dependency_overrides[get_current_user_id] = _fake_user_id

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Admin menu (core)
            resp = await client.get(f"/api/v1/workspaces/{ws.id}/menus/me")
            assert resp.status_code == 200
            assert "items" in resp.json()["data"]

            # RBAC roles (workspace-scoped read)
            resp = await client.get(f"/api/v1/workspaces/{ws.id}/rbac/roles?page=1&size=10")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert "items" in page
