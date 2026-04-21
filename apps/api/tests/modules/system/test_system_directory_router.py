from __future__ import annotations

import pytest
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization, OrganizationKind
from src.models.organization.user import User, UserStatus
from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.router import router as system_router
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


class DummyUser(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    is_super_admin: bool = True


async def _build_app() -> FastAPI:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")
    return app


@pytest.mark.usefixtures("db")
async def test_system_directory_requires_super_admin() -> None:
    app = await _build_app()

    class NonAdminUser(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        is_super_admin: bool = False

    async def _user_override() -> NonAdminUser:
        return NonAdminUser()

    app.dependency_overrides[get_current_user] = _user_override

    async with asgi_client(app) as client:
        res = await client.get("/api/v1/system/directory/users")

    assert res.status_code == 403
    assert res.json().get("error") == "SUPER_ADMIN_REQUIRED"


@pytest.mark.usefixtures("db")
async def test_system_directory_lists_all_entities() -> None:
    owner = await User.create(
        username="owner",
        email="owner@example.com",
        display_name="Owner",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    member = await User.create(
        username="member",
        email="member@example.com",
        display_name="Member",
        status=UserStatus.ACTIVE,
    )
    organization = await Organization.create(
        name="Alpha Org",
        slug="alpha-org",
        kind=OrganizationKind.TEAM,
        owner_user_id=owner.id,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Alpha Workspace",
        description="Primary delivery team",
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug="alpha-project",
        name="Alpha Project",
        description="Customer-facing site",
        created_by_user_id=owner.id,
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=member.id,
        role=OrgRole.MEMBER,
        role_code=OrgRole.MEMBER.value,
        status="active",
    )
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=member.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    await ProjectMembership.create(
        project_id=project.id,
        user_id=owner.id,
        role=ProjectMemberRole.OWNER,
        created_by_user_id=owner.id,
    )

    app = await _build_app()

    async def _super_admin_override() -> DummyUser:
        return DummyUser()

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        users_res = await client.get("/api/v1/system/directory/users")
        orgs_res = await client.get("/api/v1/system/directory/organizations")
        workspaces_res = await client.get("/api/v1/system/directory/workspaces")
        projects_res = await client.get("/api/v1/system/directory/projects")

    assert users_res.status_code == 200
    assert orgs_res.status_code == 200
    assert workspaces_res.status_code == 200
    assert projects_res.status_code == 200

    user_items = users_res.json()["data"]["items"]
    org_items = orgs_res.json()["data"]["items"]
    workspace_items = workspaces_res.json()["data"]["items"]
    project_items = projects_res.json()["data"]["items"]

    assert any(item["username"] == "owner" and item["ownedOrganizationsCount"] == 1 for item in user_items)
    assert any(item["name"] == "Alpha Org" and item["memberCount"] == 2 for item in org_items)
    assert any(item["name"] == "Alpha Workspace" and item["projectCount"] == 1 for item in workspace_items)
    assert any(item["name"] == "Alpha Project" and item["memberCount"] == 1 for item in project_items)


@pytest.mark.usefixtures("db")
async def test_system_directory_supports_search() -> None:
    user = await User.create(
        username="tenant-owner",
        email="tenant-owner@example.com",
        display_name="Tenant Owner",
        status=UserStatus.ACTIVE,
    )
    await User.create(
        username="other-user",
        email="other@example.com",
        display_name="Other User",
        status=UserStatus.ACTIVE,
    )
    organization = await Organization.create(
        name="Searchable Org",
        slug="searchable-org",
        kind=OrganizationKind.TEAM,
        owner_user_id=user.id,
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=user.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )

    app = await _build_app()

    async def _super_admin_override() -> DummyUser:
        return DummyUser()

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        users_res = await client.get("/api/v1/system/directory/users", params={"q": "tenant-owner"})
        orgs_res = await client.get("/api/v1/system/directory/organizations", params={"q": "Searchable"})

    assert users_res.status_code == 200
    assert orgs_res.status_code == 200
    assert [item["username"] for item in users_res.json()["data"]["items"]] == ["tenant-owner"]
    assert [item["name"] for item in orgs_res.json()["data"]["items"]] == ["Searchable Org"]


@pytest.mark.usefixtures("db")
async def test_system_directory_returns_entity_details() -> None:
    owner = await User.create(
        username="detail-owner",
        email="detail-owner@example.com",
        display_name="Detail Owner",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
        avatar_url="/assets/detail-owner-avatar",
    )
    organization = await Organization.create(
        name="Detail Org",
        slug="detail-org",
        kind=OrganizationKind.TEAM,
        owner_user_id=owner.id,
        logo_url="/assets/detail-org-logo",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Detail Workspace",
        description="Detailed workspace",
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
        icon_url="/assets/detail-workspace-icon",
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug="detail-project",
        name="Detail Project",
        description="Detailed project",
        created_by_user_id=owner.id,
        icon_url="/assets/detail-project-icon",
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    await ProjectMembership.create(
        project_id=project.id,
        user_id=owner.id,
        role=ProjectMemberRole.OWNER,
        created_by_user_id=owner.id,
    )

    app = await _build_app()

    async def _super_admin_override() -> DummyUser:
        return DummyUser()

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        user_res = await client.get(f"/api/v1/system/directory/users/{owner.id}")
        org_res = await client.get(f"/api/v1/system/directory/organizations/{organization.id}")
        workspace_res = await client.get(f"/api/v1/system/directory/workspaces/{workspace.id}")
        project_res = await client.get(f"/api/v1/system/directory/projects/{project.id}")

    assert user_res.status_code == 200
    assert org_res.status_code == 200
    assert workspace_res.status_code == 200
    assert project_res.status_code == 200

    assert user_res.json()["data"]["avatarUrl"] == "/assets/detail-owner-avatar"
    assert org_res.json()["data"]["logoUrl"] == "/assets/detail-org-logo"
    assert workspace_res.json()["data"]["iconUrl"] == "/assets/detail-workspace-icon"
    assert project_res.json()["data"]["iconUrl"] == "/assets/detail-project-icon"
    assert workspace_res.json()["data"]["owner"]["avatarUrl"] == "/assets/detail-owner-avatar"


@pytest.mark.usefixtures("db")
async def test_system_directory_detail_returns_not_found() -> None:
    app = await _build_app()

    async def _super_admin_override() -> DummyUser:
        return DummyUser()

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    missing_id = "019db0f5-ffff-7b20-bbe1-8a7380d53f5e"

    async with asgi_client(app) as client:
        res = await client.get(f"/api/v1/system/directory/users/{missing_id}")

    assert res.status_code == 404
    assert res.json()["error"] == "NOT_FOUND"
