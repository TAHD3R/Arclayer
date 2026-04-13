from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization, OrganizationKind
from src.models.workspaces.workspace import Workspace, WorkspaceKind, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository
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
        username=f"personal_{uuid4().hex[:10]}",
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
