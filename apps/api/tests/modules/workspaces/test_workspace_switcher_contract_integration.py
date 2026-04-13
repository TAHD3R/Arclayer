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
from src.modules.workspaces.personal_space.service import PersonalSpaceService

pytestmark = pytest.mark.integration


async def test_me_workspaces_returns_switcher_and_personal_space_truth(
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
        personal_space_service = PersonalSpaceService(settings)

        founder = await user_repo.create_user(
            username=f"founder_{uuid4().hex[:10]}",
            email="founder@example.com",
            display_name="Founder",
            password_hash=hash_password("switcher_password_123", settings.auth),
            is_super_admin=True,
        )
        setup_service.write_install_lock(setup_service.build_install_lock_metadata(initialized_by_user_id=founder.id))

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Team Org")
        user = await user_repo.create_user(
            username=f"user_{uuid4().hex[:10]}",
            email="switcher@example.com",
            display_name="Switcher User",
            password_hash=hash_password("switcher_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER, status="active")

        team_workspace = await Workspace.create(
            organization_id=org.id,
            slug=f"workspace_{uuid4().hex[:8]}",
            name="Team Workspace",
            is_active=True,
            created_by_user_id=user.id,
        )
        await WorkspaceMembership.create(
            workspace_id=team_workspace.id,
            user_id=user.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        await personal_space_service.ensure_for_login(user_id=user.id)

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
    assert len(data["items"]) == 2
    assert len(data["switcher"]["teams"]) == 1
    assert data["switcher"]["teams"][0]["kind"] == "team"
    assert data["switcher"]["personalSpace"]["status"] == "ready"
    assert data["switcher"]["personalSpace"]["workspace"]["kind"] == "personal"
    assert data["switcher"]["personalSpace"]["retryAvailable"] is False
