from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.exceptions import Conflict
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization, OrganizationKind
from src.models.workspaces.workspace import Workspace, WorkspaceKind, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository
from src.modules.organization.workspaces.schema import OrganizationWorkspaceCreateRequest
from src.modules.organization.workspaces.service import OrganizationWorkspaceService
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.workspaces.personal_space.service import PersonalSpaceService
from src.modules.workspaces.policy.service import OrgWorkspaceCreationPolicy

pytestmark = pytest.mark.integration


async def test_ensure_personal_space_is_idempotent(prepared_db) -> None:
    _ = prepared_db

    settings = get_settings()
    user_repo = UserRepository()
    service = PersonalSpaceService(settings)

    user = await user_repo.create_user(
        username=f"personal-user-{uuid4().hex[:10]}",
        email="personal@example.com",
        display_name="Personal User",
        password_hash=hash_password("personal_password_123", settings.auth),
    )

    first = await service.ensure_personal_space(user_id=UUID(str(user.id)))
    second = await service.ensure_personal_space(user_id=UUID(str(user.id)))

    assert first.organization_id == second.organization_id
    assert first.workspace_id == second.workspace_id
    assert first.created is True
    assert second.created is False

    orgs = await Organization.filter(kind=OrganizationKind.PERSONAL, owner_user_id=user.id).all()
    workspaces = await Workspace.filter(kind=WorkspaceKind.PERSONAL, owner_user_id=user.id).all()
    org_memberships = await OrgMembership.filter(organization_id=first.organization_id, user_id=user.id).all()
    workspace_memberships = await WorkspaceMembership.filter(workspace_id=first.workspace_id, user_id=user.id).all()

    assert len(orgs) == 1
    assert len(workspaces) == 1
    assert len(org_memberships) == 1
    assert len(workspace_memberships) == 1
    assert org_memberships[0].role == OrgRole.OWNER
    assert workspace_memberships[0].status == WorkspaceMembershipStatus.ACTIVE
    assert workspaces[0].slug == user.username


async def test_team_workspace_creation_rejects_personal_slug(prepared_db) -> None:
    _ = prepared_db

    settings = get_settings()
    user_repo = UserRepository()
    org_repo = OrganizationRepository()
    personal_space_service = PersonalSpaceService(settings)
    organization_workspace_service = OrganizationWorkspaceService(settings)

    user = await user_repo.create_user(
        username=f"personal-slug-{uuid4().hex[:10]}",
        email="personal-slug@example.com",
        display_name="Personal Slug User",
        password_hash=hash_password("personal_slug_password_123", settings.auth),
    )
    await personal_space_service.ensure_personal_space(user_id=UUID(str(user.id)))

    team_org = await org_repo.create_organization(
        slug=f"team-org-{uuid4().hex[:12]}",
        name="Team Org",
    )

    with pytest.raises(Conflict) as exc_info:
        await organization_workspace_service.create_workspace(
            organization_id=UUID(str(team_org.id)),
            user_id=UUID(str(user.id)),
            org_role=OrgRole.OWNER,
            payload=OrganizationWorkspaceCreateRequest(
                name="Personal Slug Collision",
                slug=user.username,
            ),
        )

    assert exc_info.value.error == "WORKSPACE_SLUG_EXISTS"


async def test_org_workspace_creation_policy_blocks_second_workspace(prepared_db) -> None:
    _ = prepared_db

    settings = get_settings()
    user_repo = UserRepository()
    org_repo = OrganizationRepository()
    workspace_repo = OrganizationWorkspaceRepository()
    policy = OrgWorkspaceCreationPolicy(settings)

    user = await user_repo.create_user(
        username=f"owner_{uuid4().hex[:10]}",
        email="owner-policy@example.com",
        display_name="Owner",
        password_hash=hash_password("owner_password_123", settings.auth),
    )
    organization = await org_repo.create_organization(
        slug=f"org_{uuid4().hex}",
        name="Team Org",
    )
    await workspace_repo.create_workspace(
        organization_id=UUID(str(organization.id)),
        slug=f"workspace_{uuid4().hex[:8]}",
        name="Primary Workspace",
        description=None,
        created_by_user_id=UUID(str(user.id)),
    )

    with pytest.raises(Conflict) as exc_info:
        await policy.assert_can_create(organization_id=UUID(str(organization.id)))

    assert exc_info.value.error == "ORG_WORKSPACE_LIMIT_REACHED"


async def test_personal_workspace_rejects_team_only_routes_and_exposes_personal_kind(
    prepared_db, integration_valkey_settings
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from src.models.organization.user import User

        user_repo = UserRepository()
        personal_space_service = PersonalSpaceService(settings)

        owner = await user_repo.create_user(
            username=f"personal_owner_{uuid4().hex[:10]}",
            email="personal-owner@example.com",
            display_name="Personal Owner",
            password_hash=hash_password("personal_owner_pass_123", settings.auth),
        )
        personal_space = await personal_space_service.ensure_personal_space(user_id=UUID(str(owner.id)))

        current_user: User | None = owner

        async def _get_user() -> User:
            assert current_user is not None
            return current_user

        async def _get_user_id() -> UUID:
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        workspace_pid = encode_uuid(personal_space.workspace_id)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            detail_resp = await client.get(f"/api/v1/workspaces/{workspace_pid}")
            assert detail_resp.status_code == 200, detail_resp.text
            assert detail_resp.json()["data"]["kind"] == WorkspaceKind.PERSONAL.value

            members_resp = await client.get(f"/api/v1/workspaces/{workspace_pid}/team/members?page=1&size=10")
            assert members_resp.status_code == 403, members_resp.text
            assert members_resp.json().get("error") == "PERSONAL_SPACE_TEAM_OPERATION_FORBIDDEN"

            invite_link_resp = await client.post(
                f"/api/v1/workspaces/{workspace_pid}/team/invite-links",
                json={"roleCode": "admin", "expiresInSeconds": 3600},
            )
            assert invite_link_resp.status_code == 403, invite_link_resp.text
            assert invite_link_resp.json().get("error") == "PERSONAL_SPACE_TEAM_OPERATION_FORBIDDEN"

            rbac_resp = await client.get(f"/api/v1/workspaces/{workspace_pid}/rbac/roles?page=1&size=10")
            assert rbac_resp.status_code == 403, rbac_resp.text
            assert rbac_resp.json().get("error") == "PERSONAL_SPACE_TEAM_OPERATION_FORBIDDEN"

            role_policy_resp = await client.get(f"/api/v1/workspaces/{workspace_pid}/settings/role-policy")
            assert role_policy_resp.status_code == 403, role_policy_resp.text
            assert role_policy_resp.json().get("error") == "PERSONAL_SPACE_TEAM_OPERATION_FORBIDDEN"


async def test_one_owner_team_workspace_keeps_team_capabilities_and_exposes_team_kind(
    prepared_db, integration_valkey_settings
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from src.models.organization.user import User

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        owner = await user_repo.create_user(
            username=f"team_owner_{uuid4().hex[:10]}",
            email="team-owner@example.com",
            display_name="Team Owner",
            password_hash=hash_password("team_owner_pass_123", settings.auth),
        )
        org = await org_repo.create_organization(slug=f"team-org-{uuid4().hex[:12]}", name="Team Org")
        await OrgMembership.create(
            organization_id=org.id,
            user_id=owner.id,
            role=OrgRole.OWNER,
            role_code=OrgRole.OWNER.value,
            status="active",
        )
        workspace = await Workspace.create(
            organization_id=org.id,
            slug=f"team-ws-{uuid4().hex[:8]}",
            name="Team Workspace",
            kind=WorkspaceKind.TEAM,
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

        workspace_pid = encode_uuid(workspace.id)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            detail_resp = await client.get(f"/api/v1/workspaces/{workspace_pid}")
            assert detail_resp.status_code == 200, detail_resp.text
            assert detail_resp.json()["data"]["kind"] == WorkspaceKind.TEAM.value

            members_resp = await client.get(f"/api/v1/workspaces/{workspace_pid}/team/members?page=1&size=10")
            assert members_resp.status_code == 200, members_resp.text
            members_page = members_resp.json()["data"]
            assert members_page["total"] == 1

            invite_link_resp = await client.post(
                f"/api/v1/workspaces/{workspace_pid}/team/invite-links",
                json={"roleCode": "admin", "expiresInSeconds": 3600},
            )
            assert invite_link_resp.status_code == 200, invite_link_resp.text
            assert invite_link_resp.json()["data"]["token"]

            rbac_resp = await client.get(f"/api/v1/workspaces/{workspace_pid}/rbac/roles?page=1&size=10")
            assert rbac_resp.status_code == 200, rbac_resp.text
            role_codes = {item["code"] for item in rbac_resp.json()["data"]["items"]}
            assert "owner" in role_codes

            role_policy_resp = await client.get(f"/api/v1/workspaces/{workspace_pid}/settings/role-policy")
            assert role_policy_resp.status_code == 200, role_policy_resp.text
            assert role_policy_resp.json()["data"]["defaultRoleCode"] == "viewer"
