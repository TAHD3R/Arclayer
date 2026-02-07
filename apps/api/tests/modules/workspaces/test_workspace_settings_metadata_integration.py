from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.common.utils.public_ids import encode_uuid
from apps.api.config import get_settings
from apps.api.core.database.orm import verify_db_ready
from apps.api.core.registry import create_app
from apps.api.modules.auth.deps import get_current_user, get_current_user_id

pytestmark = pytest.mark.integration


async def test_workspace_metadata_get_and_patch(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.modules.auth.repository import UserRepository
        from apps.api.modules.auth.security import hash_password
        from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.modules.organization.models.user import User
        from apps.api.modules.organization.repository import OrganizationRepository
        from apps.api.modules.workspaces.models.workspace import Workspace

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug="default",
            name="Default",
            is_active=True,
            created_by_user_id=owner.id,
        )

        current_user: User | None = owner

        async def _get_user():
            assert current_user is not None
            return current_user

        async def _get_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        ws_pid = encode_uuid(ws.id)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            resp = await client.get(f"/api/v1/workspaces/{ws_pid}")
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["id"] == ws_pid
            assert data["organizationId"] == encode_uuid(org.id)
            assert data["name"] == "Default"
            assert data["slug"] == "default"

            resp = await client.patch(
                f"/api/v1/workspaces/{ws_pid}",
                json={"name": "My Blog", "slug": "my-blog"},
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["name"] == "My Blog"
            assert data["slug"] == "my-blog"

            # Invalid slug should be rejected.
            resp = await client.patch(
                f"/api/v1/workspaces/{ws_pid}",
                json={"slug": "Bad Slug"},
            )
            assert resp.status_code == 400
