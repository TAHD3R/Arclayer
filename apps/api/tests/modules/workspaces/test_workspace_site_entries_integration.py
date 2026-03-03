from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.modules.auth.deps import get_current_user, get_current_user_id
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.src.modules.organization.models.user import User
from apps.api.src.modules.organization.repository import OrganizationRepository
from apps.api.src.modules.workspaces.models.workspace import Workspace

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_workspace_site_content_endpoints_are_disabled(prepared_db, integration_valkey_settings) -> None:
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
            # Site metadata and preview token endpoints are retained.
            site_res = await client.get(f"/api/v1/workspaces/{ws.id}/site")
            assert site_res.status_code == 200, site_res.text

            token_res = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/preview-tokens",
                json={"ttlSeconds": 600},
            )
            assert token_res.status_code == 201, token_res.text

            # Legacy workspace site content endpoints are removed after hard cut.
            list_types_res = await client.get(f"/api/v1/workspaces/{ws.id}/site/entry-types")
            assert list_types_res.status_code == 404, list_types_res.text

            create_entry_res = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/entries",
                json={"entryTypeCode": "article", "slug": "legacy-should-fail"},
            )
            assert create_entry_res.status_code == 404, create_entry_res.text
