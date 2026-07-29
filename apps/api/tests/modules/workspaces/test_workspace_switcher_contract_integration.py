from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository
from src.modules.system.setup.service import InstanceSetupService

pytestmark = pytest.mark.integration


async def test_me_workspaces_returns_workspace_items(prepared_db, integration_valkey_settings, tmp_path: Path) -> None:
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

        setup_service = InstanceSetupService(settings)
        org_repo = OrganizationRepository()
        user_repo = UserRepository()
        founder = await user_repo.create_user(
            username=f"founder_{uuid4().hex[:10]}",
            email="founder@example.com",
            display_name="Founder",
            password_hash=hash_password("switcher_password_123", settings.auth),
            is_super_admin=True,
        )
        setup_service.write_install_lock(setup_service.build_install_lock_metadata(initialized_by_user_id=founder.id))

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org")
        user = await user_repo.create_user(
            username=f"user_{uuid4().hex[:10]}",
            email="switcher@example.com",
            display_name="Switcher User",
            password_hash=hash_password("switcher_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER, status="active")

        workspace = await Workspace.create(
            organization_id=org.id,
            slug=f"workspace_{uuid4().hex[:8]}",
            name="Workspace",
            is_active=True,
            created_by_user_id=user.id,
            icon_mode="glyph",
            icon_color="#2563eb",
            icon_glyph="rocket",
        )
        await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=user.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )

        async def _get_user() -> User:
            return user

        async def _get_user_id():
            return user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            response = await client.get("/api/v1/me/workspaces")

        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()["data"]

    assert data["instanceSetup"]["status"] == "ready"
    assert len(data["items"]) == 1
    assert "kind" not in data["items"][0]
    assert "switcher" not in data
    assert data["items"][0]["iconMode"] == "glyph"
    assert data["items"][0]["iconColor"] == "#2563eb"
    assert data["items"][0]["iconGlyph"] == "rocket"


async def test_me_workspaces_reports_existing_workspace_without_identity_mode_state(
    prepared_db, integration_valkey_settings, tmp_path: Path
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

        setup_service = InstanceSetupService(settings)
        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        founder = await user_repo.create_user(
            username=f"founder_{uuid4().hex[:10]}",
            email="founder@example.com",
            display_name="Founder",
            password_hash=hash_password("switcher_password_123", settings.auth),
            is_super_admin=True,
        )
        setup_service.write_install_lock(setup_service.build_install_lock_metadata(initialized_by_user_id=founder.id))

        org = await org_repo.create_organization(slug=f"legacy_org_{uuid4().hex}", name="Legacy Org")
        user = await user_repo.create_user(
            username=f"legacy_user_{uuid4().hex[:10]}",
            email="legacy-switcher@example.com",
            display_name="Legacy Switcher User",
            password_hash=hash_password("switcher_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER, status="active")

        workspace = await Workspace.create(
            organization_id=org.id,
            slug=f"legacy_workspace_{uuid4().hex[:8]}",
            name="Existing Workspace",
            is_active=True,
            created_by_user_id=user.id,
            icon_mode="emoji",
            icon_color="#22c55e",
            icon_emoji="🌿",
        )
        await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=user.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )

        async def _get_user() -> User:
            return user

        async def _get_user_id():
            return user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            response = await client.get("/api/v1/me/workspaces")

        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()["data"]

    assert len(data["items"]) == 1
    assert "kind" not in data["items"][0]
    assert data["items"][0]["iconMode"] == "emoji"
    assert data["items"][0]["iconColor"] == "#22c55e"
    assert data["items"][0]["iconEmoji"] == "🌿"
    assert "switcher" not in data
