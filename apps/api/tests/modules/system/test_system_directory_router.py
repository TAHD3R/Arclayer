from __future__ import annotations

import builtins
from datetime import datetime

import pytest
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.models.auth.oauth_identity import OAuthIdentity
from src.models.auth.user_two_factor import UserTwoFactor, UserTwoFactorBackupCode
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization, OrganizationKind
from src.models.organization.user import User, UserCredential, UserStatus
from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.system.rbac import Role
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password, verify_password
from src.modules.system.router import router as system_router
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


class DummyUser(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    is_super_admin: bool = True


class DummyValkey:
    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    def key(self, *parts: str) -> str:
        return ":".join(parts)

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(
        self, key: str, value: str, *, ex: int | None = None, nx: bool | None = None, xx: bool | None = None
    ) -> bool:
        if nx and key in self._store:
            return False
        if xx and key not in self._store:
            return False
        self._store[key] = value
        return True

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            if key in self._store:
                deleted += 1
                self._store.pop(key, None)
        return deleted

    async def exists(self, *keys: str) -> int:
        return sum(1 for key in keys if key in self._store)

    async def expire(self, key: str, seconds: int) -> bool:
        return key in self._store

    async def ttl(self, key: str) -> int:
        return 1 if key in self._store else -2

    async def getdel(self, key: str) -> str | None:
        return self._store.pop(key, None)

    async def setex(self, key: str, seconds: int, value: str) -> bool:
        self._store[key] = value
        return True

    async def incr(self, key: str, amount: int = 1) -> int:
        current = int(self._store.get(key, "0"))
        current += amount
        self._store[key] = str(current)
        return current

    async def sadd(self, key: str, *members: str) -> int:
        current: set[str] = set((self._store.get(key, "") or "").split("\n")) if key in self._store else set()
        before = len({member for member in current if member})
        current.update(members)
        normalized = {member for member in current if member}
        self._store[key] = "\n".join(sorted(normalized))
        return len(normalized) - before

    async def srem(self, key: str, *members: str) -> int:
        current = set((self._store.get(key, "") or "").split("\n")) if key in self._store else set()
        before = len({member for member in current if member})
        for member in members:
            current.discard(member)
        normalized = {member for member in current if member}
        self._store[key] = "\n".join(sorted(normalized))
        return before - len(normalized)

    async def smembers(self, key: str) -> builtins.set[str]:
        return {member for member in (self._store.get(key, "") or "").split("\n") if member}

    async def set_json(
        self, key: str, data: object, *, ex: int | None = None, nx: bool | None = None, xx: bool | None = None
    ) -> bool:
        import json

        return await self.set(key, json.dumps(data), ex=ex, nx=nx, xx=xx)

    async def get_json(self, key: str):
        import json

        raw = await self.get(key)
        return json.loads(raw) if raw is not None else None


async def _build_app() -> FastAPI:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")
    app.state.valkey = DummyValkey()
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
async def test_system_directory_workspace_and_project_lists_include_owner_and_icon_fields() -> None:
    owner = await User.create(
        username="icon-owner",
        email="icon-owner@example.com",
        display_name="Icon Owner",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    organization = await Organization.create(
        name="Icon Org",
        slug="icon-org",
        kind=OrganizationKind.TEAM,
        owner_user_id=owner.id,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Icon Workspace",
        description="Workspace with glyph icon",
        owner_user_id=None,
        created_by_user_id=owner.id,
        icon_mode="glyph",
        icon_glyph="rocket",
        icon_color="#112233",
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug="icon-project",
        name="Icon Project",
        description="Project with glyph icon",
        created_by_user_id=owner.id,
        icon_mode="glyph",
        icon_glyph="rocket",
        icon_color="#445566",
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    workspace_membership = await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    owner_role = await Role.get(workspace_id=workspace.id, code="owner")
    await WorkspaceMembershipRole.get_or_create(membership_id=workspace_membership.id, role_id=owner_role.id)
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
        workspace_res = await client.get("/api/v1/system/directory/workspaces")
        project_res = await client.get("/api/v1/system/directory/projects")

    assert workspace_res.status_code == 200
    assert project_res.status_code == 200

    workspace_item = workspace_res.json()["data"]["items"][0]
    project_item = project_res.json()["data"]["items"][0]

    assert workspace_item["owner"]["username"] == "icon-owner"
    assert workspace_item["iconMode"] == "glyph"
    assert workspace_item["iconGlyph"] == "rocket"
    assert workspace_item["iconColor"] == "#112233"
    assert project_item["owner"]["username"] == "icon-owner"
    assert project_item["iconMode"] == "glyph"
    assert project_item["iconGlyph"] == "rocket"
    assert project_item["iconColor"] == "#445566"


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
async def test_system_directory_user_filters_and_sorting() -> None:
    base_time = datetime(2026, 4, 1, 8, 0, 0)
    alpha = await User.create(
        username="alpha",
        email="alpha@example.com",
        display_name="Alpha",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
        last_login_at=base_time,
    )
    bravo = await User.create(
        username="bravo",
        email="bravo@example.com",
        display_name="Bravo",
        status=UserStatus.DISABLED,
        is_super_admin=False,
        last_login_at=base_time.replace(day=2),
    )
    charlie = await User.create(
        username="charlie",
        email="charlie@example.com",
        display_name="Charlie",
        status=UserStatus.LOCKED,
        is_super_admin=False,
        last_login_at=base_time.replace(day=3),
    )
    settings = get_settings()
    await UserCredential.create(user=alpha, password_hash=hash_password("alpha12345", settings.auth))
    await UserTwoFactor.create(
        user_id=alpha.id,
        totp_secret_enc="secret",
        enabled_at=alpha.created_at,
        last_totp_counter=None,
        last_totp_used_at=None,
    )
    await OAuthIdentity.create(
        provider="google",
        subject="alpha-google",
        user_id=alpha.id,
        email=alpha.email,
    )

    app = await _build_app()

    async def _super_admin_override() -> DummyUser:
        return DummyUser()

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        active_res = await client.get("/api/v1/system/directory/users", params={"status": "active"})
        super_admin_res = await client.get(
            "/api/v1/system/directory/users",
            params={"is_super_admin": True},
        )
        password_res = await client.get("/api/v1/system/directory/users", params={"has_password": True})
        two_factor_res = await client.get(
            "/api/v1/system/directory/users",
            params={"two_factor_enabled": True},
        )
        oauth_res = await client.get("/api/v1/system/directory/users", params={"oauth_provider": "any"})
        local_only_res = await client.get(
            "/api/v1/system/directory/users",
            params={"oauth_provider": "none"},
        )
        sorted_res = await client.get("/api/v1/system/directory/users", params={"ordering": "username"})

    assert [item["username"] for item in active_res.json()["data"]["items"]] == ["alpha"]
    assert [item["username"] for item in super_admin_res.json()["data"]["items"]] == ["alpha"]
    assert [item["username"] for item in password_res.json()["data"]["items"]] == ["alpha"]
    assert [item["username"] for item in two_factor_res.json()["data"]["items"]] == ["alpha"]
    assert [item["username"] for item in oauth_res.json()["data"]["items"]] == ["alpha"]
    assert {item["username"] for item in local_only_res.json()["data"]["items"]} == {"bravo", "charlie"}
    assert [item["username"] for item in sorted_res.json()["data"]["items"]] == [
        "alpha",
        "bravo",
        "charlie",
    ]


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


@pytest.mark.usefixtures("db")
async def test_system_directory_user_governance_actions_update_account_and_sessions() -> None:
    settings = get_settings()
    acting_admin = await User.create(
        username="platform-admin",
        email="platform-admin@example.com",
        display_name="Platform Admin",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    managed_user = await User.create(
        username="managed-user",
        email="managed@example.com",
        display_name="Managed User",
        status=UserStatus.ACTIVE,
        token_version=1,
        avatar_url="/assets/original-avatar",
    )
    await UserCredential.create(
        user=managed_user,
        password_hash=hash_password("old_password_123", settings.auth),
    )
    await UserTwoFactor.create(
        user_id=managed_user.id,
        totp_secret_enc="secret",
        enabled_at=managed_user.created_at,
        last_totp_counter=None,
        last_totp_used_at=None,
    )
    await OAuthIdentity.create(
        provider="google",
        subject="google-subject",
        user_id=managed_user.id,
        email=managed_user.email,
    )

    app = await _build_app()

    async def _super_admin_override() -> User:
        return acting_admin

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    user_id = str(managed_user.id)
    async with asgi_client(app) as client:
        profile_res = await client.patch(
            f"/api/v1/system/directory/users/{user_id}",
            json={
                "displayName": "Managed Renamed",
                "email": "managed2@example.com",
                "avatarAssetId": None,
            },
        )
        password_res = await client.post(
            f"/api/v1/system/directory/users/{user_id}/reset-password",
            json={"newPassword": "new_password_123"},
        )
        reset_email_res = await client.post(
            f"/api/v1/system/directory/users/{user_id}/send-reset-password-email",
        )
        sessions_res = await client.post(f"/api/v1/system/directory/users/{user_id}/revoke-sessions")
        disable_2fa_res = await client.post(f"/api/v1/system/directory/users/{user_id}/disable-two-factor")
        unlink_oauth_res = await client.delete(
            f"/api/v1/system/directory/users/{user_id}/oauth-identities/google",
        )
        disable_res = await client.post(f"/api/v1/system/directory/users/{user_id}/disable")
        enable_res = await client.post(f"/api/v1/system/directory/users/{user_id}/enable")

    assert profile_res.status_code == 200
    assert profile_res.json()["data"]["displayName"] == "Managed Renamed"
    assert profile_res.json()["data"]["email"] == "managed2@example.com"
    assert profile_res.json()["data"]["avatarUrl"] is None
    assert password_res.status_code == 200
    assert reset_email_res.status_code == 200
    assert sessions_res.status_code == 200
    assert disable_2fa_res.status_code == 200
    assert disable_2fa_res.json()["data"]["twoFactorEnabled"] is False
    assert unlink_oauth_res.status_code == 200
    assert unlink_oauth_res.json()["data"]["linkedOauthProviders"] == []
    assert disable_res.status_code == 200
    assert disable_res.json()["data"]["status"] == "disabled"
    assert enable_res.status_code == 200
    assert enable_res.json()["data"]["status"] == "active"

    updated = await UserRepository().get_by_id_with_credential(managed_user.id)
    assert updated is not None
    assert updated.display_name == "Managed Renamed"
    assert updated.email == "managed2@example.com"
    assert updated.avatar_url is None
    assert updated.status == UserStatus.ACTIVE
    assert updated.token_version == 4
    updated_credential = await UserCredential.get_or_none(user_id=managed_user.id)
    assert updated_credential is not None
    assert verify_password("new_password_123", updated_credential.password_hash, settings.auth)
    assert await UserTwoFactor.filter(user_id=managed_user.id).count() == 0
    assert await OAuthIdentity.filter(user_id=managed_user.id).count() == 0


@pytest.mark.usefixtures("db")
async def test_system_directory_user_governance_rejects_email_conflict_and_self_disable() -> None:
    acting_admin = await User.create(
        username="self-admin",
        email="self-admin@example.com",
        display_name="Self Admin",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    managed_user = await User.create(
        username="conflict-user",
        email="conflict@example.com",
        display_name="Conflict User",
        status=UserStatus.ACTIVE,
    )

    app = await _build_app()

    async def _super_admin_override() -> User:
        return acting_admin

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        conflict_res = await client.patch(
            f"/api/v1/system/directory/users/{managed_user.id}",
            json={"email": "self-admin@example.com"},
        )
        self_disable_res = await client.post(f"/api/v1/system/directory/users/{acting_admin.id}/disable")

    assert conflict_res.status_code == 409
    assert conflict_res.json()["error"] == "EMAIL_EXISTS"
    assert self_disable_res.status_code == 400
    assert self_disable_res.json()["error"] == "CANNOT_DISABLE_SELF"


@pytest.mark.usefixtures("db")
async def test_system_directory_user_governance_rejects_unlinking_last_sign_in_method() -> None:
    acting_admin = await User.create(
        username="oauth-admin",
        email="oauth-admin@example.com",
        display_name="OAuth Admin",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    managed_user = await User.create(
        username="oauth-only-user",
        email="oauth-only@example.com",
        display_name="OAuth Only",
        status=UserStatus.ACTIVE,
    )
    await OAuthIdentity.create(
        provider="google",
        subject="oauth-only-google",
        user_id=managed_user.id,
        email=managed_user.email,
    )

    app = await _build_app()

    async def _super_admin_override() -> User:
        return acting_admin

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        unlink_res = await client.delete(
            f"/api/v1/system/directory/users/{managed_user.id}/oauth-identities/google",
        )

    assert unlink_res.status_code == 409
    assert unlink_res.json()["error"] == "LAST_SIGNIN_METHOD"


@pytest.mark.usefixtures("db")
async def test_system_directory_deletes_user_account_with_account_cleanup() -> None:
    settings = get_settings()
    acting_admin = await User.create(
        username="delete-admin",
        email="delete-admin@example.com",
        display_name="Delete Admin",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    managed_user = await User.create(
        username="delete-target",
        email="delete-target@example.com",
        display_name="Delete Target",
        status=UserStatus.ACTIVE,
        token_version=1,
        avatar_url="/assets/delete-target-avatar",
    )
    other_owner = await User.create(
        username="delete-other-owner",
        email="delete-other-owner@example.com",
        display_name="Delete Other Owner",
        status=UserStatus.ACTIVE,
    )
    await UserCredential.create(
        user=managed_user,
        password_hash=hash_password("old_password_123", settings.auth),
    )
    await UserTwoFactor.create(
        user_id=managed_user.id,
        totp_secret_enc="secret",
        enabled_at=managed_user.created_at,
        last_totp_counter=None,
        last_totp_used_at=None,
    )
    await UserTwoFactorBackupCode.create(
        user_id=managed_user.id,
        salt="salt",
        code_hash="hash",
        used_at=None,
    )
    await OAuthIdentity.create(
        provider="google",
        subject="delete-target-google",
        user_id=managed_user.id,
        email=managed_user.email,
    )
    organization = await Organization.create(
        name="Delete Org",
        slug="delete-org",
        kind=OrganizationKind.TEAM,
        owner_user_id=other_owner.id,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Delete Workspace",
        owner_user_id=other_owner.id,
        created_by_user_id=other_owner.id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug="delete-project",
        name="Delete Project",
        created_by_user_id=other_owner.id,
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=managed_user.id,
        role=OrgRole.MEMBER,
        role_code=OrgRole.MEMBER.value,
        status="active",
    )
    workspace_membership = await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=managed_user.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    await ProjectMembership.create(
        project_id=project.id,
        user_id=managed_user.id,
        role=ProjectMemberRole.EDITOR,
        created_by_user_id=other_owner.id,
    )

    app = await _build_app()

    async def _super_admin_override() -> User:
        return acting_admin

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        res = await client.delete(f"/api/v1/system/directory/users/{managed_user.id}")

    assert res.status_code == 200
    assert res.json()["data"] is None

    deleted = await User.get(id=managed_user.id)
    assert deleted.username.startswith("deleted_")
    assert deleted.email is None
    assert deleted.display_name is None
    assert deleted.avatar_url is None
    assert deleted.status == UserStatus.DISABLED
    assert deleted.token_version == 2
    assert await UserCredential.filter(user_id=managed_user.id).count() == 0
    assert await OAuthIdentity.filter(user_id=managed_user.id).count() == 0
    assert await UserTwoFactor.filter(user_id=managed_user.id).count() == 0
    assert await UserTwoFactorBackupCode.filter(user_id=managed_user.id).count() == 0
    assert await OrgMembership.filter(user_id=managed_user.id).count() == 0
    assert await ProjectMembership.filter(user_id=managed_user.id).count() == 0
    updated_membership = await WorkspaceMembership.get(id=workspace_membership.id)
    assert updated_membership.status == WorkspaceMembershipStatus.DISABLED


@pytest.mark.usefixtures("db")
async def test_system_directory_deletes_user_account_with_owned_entities_cascade() -> None:
    acting_admin = await User.create(
        username="cascade-admin",
        email="cascade-admin@example.com",
        display_name="Cascade Admin",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    managed_user = await User.create(
        username="cascade-target",
        email="cascade-target@example.com",
        display_name="Cascade Target",
        status=UserStatus.ACTIVE,
        token_version=3,
    )
    shared_owner = await User.create(
        username="shared-owner",
        email="shared-owner@example.com",
        display_name="Shared Owner",
        status=UserStatus.ACTIVE,
    )

    owned_org = await Organization.create(
        name="Owned Org",
        slug="owned-org",
        kind=OrganizationKind.TEAM,
        owner_user_id=managed_user.id,
    )
    await OrgMembership.create(
        organization_id=owned_org.id,
        user_id=managed_user.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    owned_org_workspace = await Workspace.create(
        organization_id=owned_org.id,
        name="Owned Org Workspace",
        owner_user_id=managed_user.id,
        created_by_user_id=managed_user.id,
    )
    await ProjectRecord.create(
        workspace_id=owned_org_workspace.id,
        slug="owned-org-project",
        name="Owned Org Project",
        created_by_user_id=managed_user.id,
    )

    shared_org = await Organization.create(
        name="Shared Org",
        slug="shared-org",
        kind=OrganizationKind.TEAM,
        owner_user_id=shared_owner.id,
    )
    await OrgMembership.create(
        organization_id=shared_org.id,
        user_id=shared_owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    await OrgMembership.create(
        organization_id=shared_org.id,
        user_id=managed_user.id,
        role=OrgRole.ADMIN,
        role_code=OrgRole.ADMIN.value,
        status="active",
    )
    owned_workspace = await Workspace.create(
        organization_id=shared_org.id,
        name="Owned Workspace",
        owner_user_id=None,
        created_by_user_id=managed_user.id,
    )
    owned_workspace_membership = await WorkspaceMembership.create(
        workspace_id=owned_workspace.id,
        user_id=managed_user.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    owned_workspace_role = await Role.get(workspace_id=owned_workspace.id, code="owner")
    await WorkspaceMembershipRole.get_or_create(
        membership_id=owned_workspace_membership.id,
        role_id=owned_workspace_role.id,
    )

    shared_workspace = await Workspace.create(
        organization_id=shared_org.id,
        name="Shared Workspace",
        owner_user_id=shared_owner.id,
        created_by_user_id=shared_owner.id,
    )
    await WorkspaceMembership.create(
        workspace_id=shared_workspace.id,
        user_id=shared_owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    created_project = await ProjectRecord.create(
        workspace_id=shared_workspace.id,
        slug="created-project",
        name="Created Project",
        created_by_user_id=managed_user.id,
    )
    shared_project = await ProjectRecord.create(
        workspace_id=shared_workspace.id,
        slug="shared-project",
        name="Shared Project",
        created_by_user_id=shared_owner.id,
    )
    await ProjectMembership.create(
        project_id=shared_project.id,
        user_id=managed_user.id,
        role=ProjectMemberRole.EDITOR,
        created_by_user_id=shared_owner.id,
    )

    app = await _build_app()

    async def _super_admin_override() -> User:
        return acting_admin

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        res = await client.delete(f"/api/v1/system/directory/users/{managed_user.id}")

    assert res.status_code == 200, res.text
    assert await Organization.filter(id=owned_org.id).count() == 0
    assert await Workspace.filter(id=owned_workspace.id).count() == 0
    assert await ProjectRecord.filter(id=created_project.id).count() == 0
    assert await Workspace.filter(id=shared_workspace.id).count() == 1
    assert await ProjectRecord.filter(id=shared_project.id).count() == 1

    deleted = await User.get(id=managed_user.id)
    assert deleted.username.startswith("deleted_")
    assert deleted.status == UserStatus.DISABLED
    assert deleted.token_version == 4


@pytest.mark.usefixtures("db")
async def test_system_directory_rejects_self_delete() -> None:
    acting_admin = await User.create(
        username="delete-self-admin",
        email="delete-self-admin@example.com",
        display_name="Delete Self Admin",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )

    app = await _build_app()

    async def _super_admin_override() -> User:
        return acting_admin

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        res = await client.delete(f"/api/v1/system/directory/users/{acting_admin.id}")

    assert res.status_code == 400
    assert res.json()["error"] == "CANNOT_DELETE_SELF"


@pytest.mark.usefixtures("db")
async def test_system_directory_filters_and_governs_organizations_workspaces_and_projects() -> None:
    acting_admin = await User.create(
        username="directory-admin",
        email="directory-admin@example.com",
        display_name="Directory Admin",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    owner = await User.create(
        username="directory-owner",
        email="directory-owner@example.com",
        display_name="Directory Owner",
        status=UserStatus.ACTIVE,
    )
    replacement_owner = await User.create(
        username="replacement-owner",
        email="replacement-owner@example.com",
        display_name="Replacement Owner",
        status=UserStatus.ACTIVE,
    )
    organization = await Organization.create(
        name="Bravo Org",
        slug="bravo-org",
        kind=OrganizationKind.TEAM,
        owner_user_id=owner.id,
        is_active=True,
    )
    personal_organization = await Organization.create(
        name="Personal Org",
        slug="personal-org",
        kind=OrganizationKind.PERSONAL,
        owner_user_id=owner.id,
        is_active=False,
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
        user_id=replacement_owner.id,
        role=OrgRole.MEMBER,
        role_code=OrgRole.MEMBER.value,
        status="active",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Zulu Workspace",
        description="Workspace before update",
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
        is_active=True,
    )
    archived_workspace = await Workspace.create(
        organization_id=organization.id,
        name="Archived Workspace",
        description="Already archived",
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
        is_active=False,
        archived_at=datetime(2026, 4, 2, 8, 0, 0),
        archived_by_user_id=acting_admin.id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug="zulu-project",
        name="Zulu Project",
        description="Project before update",
        created_by_user_id=owner.id,
        is_active=True,
    )
    disabled_project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug="disabled-project",
        name="Disabled Project",
        description="Disabled project",
        created_by_user_id=owner.id,
        is_active=False,
    )
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=replacement_owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    await ProjectMembership.create(
        project_id=project.id,
        user_id=owner.id,
        role=ProjectMemberRole.OWNER,
        created_by_user_id=owner.id,
    )
    await ProjectMembership.create(
        project_id=project.id,
        user_id=replacement_owner.id,
        role=ProjectMemberRole.EDITOR,
        created_by_user_id=owner.id,
    )

    app = await _build_app()

    async def _super_admin_override() -> User:
        return acting_admin

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        org_kind_res = await client.get("/api/v1/system/directory/organizations", params={"kind": "team"})
        org_inactive_res = await client.get(
            "/api/v1/system/directory/organizations",
            params={"is_active": False},
        )
        workspace_archived_res = await client.get(
            "/api/v1/system/directory/workspaces",
            params={"is_archived": True},
        )
        workspace_org_res = await client.get(
            "/api/v1/system/directory/workspaces",
            params={"organization_id": str(organization.id)},
        )
        project_workspace_res = await client.get(
            "/api/v1/system/directory/projects",
            params={"workspace_id": str(workspace.id)},
        )
        project_inactive_res = await client.get(
            "/api/v1/system/directory/projects",
            params={"is_active": False},
        )

        update_org_res = await client.patch(
            f"/api/v1/system/directory/organizations/{organization.id}",
            json={
                "name": "Alpha Org",
                "slug": "alpha-org",
                "ownerUserId": str(replacement_owner.id),
            },
        )
        disable_org_res = await client.post(f"/api/v1/system/directory/organizations/{organization.id}/disable")
        enable_org_res = await client.post(f"/api/v1/system/directory/organizations/{organization.id}/enable")

        update_workspace_res = await client.patch(
            f"/api/v1/system/directory/workspaces/{workspace.id}",
            json={
                "name": "Alpha Workspace",
                "description": "Workspace after update",
                "iconMode": "emoji",
                "iconEmoji": "🚀",
                "iconColor": "#112233",
            },
        )
        archive_workspace_res = await client.post(f"/api/v1/system/directory/workspaces/{workspace.id}/archive")
        restore_workspace_res = await client.post(f"/api/v1/system/directory/workspaces/{workspace.id}/restore")
        disable_workspace_res = await client.post(f"/api/v1/system/directory/workspaces/{workspace.id}/disable")
        enable_workspace_res = await client.post(f"/api/v1/system/directory/workspaces/{workspace.id}/enable")

        update_project_res = await client.patch(
            f"/api/v1/system/directory/projects/{project.id}",
            json={
                "name": "Alpha Project",
                "slug": "alpha-project",
                "description": "Project after update",
                "iconMode": "glyph",
                "iconGlyph": "rocket",
                "iconColor": "#334455",
            },
        )
        disable_project_res = await client.post(f"/api/v1/system/directory/projects/{project.id}/disable")
        enable_project_res = await client.post(f"/api/v1/system/directory/projects/{project.id}/enable")
        delete_project_res = await client.request(
            "DELETE",
            f"/api/v1/system/directory/projects/{disabled_project.id}",
            json={"confirmName": "Disabled Project"},
        )

    assert org_kind_res.status_code == 200
    assert [item["name"] for item in org_kind_res.json()["data"]["items"]] == ["Bravo Org"]
    assert org_inactive_res.status_code == 200
    assert [item["name"] for item in org_inactive_res.json()["data"]["items"]] == ["Personal Org"]

    assert workspace_archived_res.status_code == 200
    assert [item["name"] for item in workspace_archived_res.json()["data"]["items"]] == ["Archived Workspace"]
    assert workspace_org_res.status_code == 200
    assert {item["name"] for item in workspace_org_res.json()["data"]["items"]} == {
        "Zulu Workspace",
        "Archived Workspace",
    }

    assert project_workspace_res.status_code == 200
    assert {item["name"] for item in project_workspace_res.json()["data"]["items"]} == {
        "Zulu Project",
        "Disabled Project",
    }
    assert project_inactive_res.status_code == 200
    assert [item["name"] for item in project_inactive_res.json()["data"]["items"]] == ["Disabled Project"]

    assert update_org_res.status_code == 200
    assert update_org_res.json()["data"]["name"] == "Alpha Org"
    assert update_org_res.json()["data"]["slug"] == "alpha-org"
    assert update_org_res.json()["data"]["owner"]["username"] == "replacement-owner"
    assert disable_org_res.status_code == 200
    assert disable_org_res.json()["data"]["isActive"] is False
    assert enable_org_res.status_code == 200
    assert enable_org_res.json()["data"]["isActive"] is True

    assert update_workspace_res.status_code == 200
    assert update_workspace_res.json()["data"]["name"] == "Alpha Workspace"
    assert update_workspace_res.json()["data"]["description"] == "Workspace after update"
    assert update_workspace_res.json()["data"]["iconEmoji"] == "🚀"
    assert archive_workspace_res.status_code == 200
    assert archive_workspace_res.json()["data"]["isArchived"] is True
    assert restore_workspace_res.status_code == 200
    assert restore_workspace_res.json()["data"]["isArchived"] is False
    assert disable_workspace_res.status_code == 200
    assert disable_workspace_res.json()["data"]["isActive"] is False
    assert enable_workspace_res.status_code == 200
    assert enable_workspace_res.json()["data"]["isActive"] is True

    assert update_project_res.status_code == 200
    assert update_project_res.json()["data"]["name"] == "Alpha Project"
    assert update_project_res.json()["data"]["slug"] == "alpha-project"
    assert update_project_res.json()["data"]["iconGlyph"] == "rocket"
    assert disable_project_res.status_code == 200
    assert disable_project_res.json()["data"]["isActive"] is False
    assert enable_project_res.status_code == 200
    assert enable_project_res.json()["data"]["isActive"] is True
    assert delete_project_res.status_code == 200
    assert delete_project_res.json()["data"] is None

    refreshed_org = await Organization.get(id=organization.id)
    refreshed_workspace = await Workspace.get(id=workspace.id)
    refreshed_project = await ProjectRecord.get(id=project.id)
    assert refreshed_org.owner_user_id == replacement_owner.id
    replacement_membership = await OrgMembership.get(
        organization_id=organization.id,
        user_id=replacement_owner.id,
    )
    previous_owner_membership = await OrgMembership.get(
        organization_id=organization.id,
        user_id=owner.id,
    )
    assert replacement_membership.role == OrgRole.OWNER
    assert previous_owner_membership.role == OrgRole.ADMIN
    assert refreshed_workspace.name == "Alpha Workspace"
    assert refreshed_workspace.icon_emoji == "🚀"
    assert refreshed_project.name == "Alpha Project"
    assert refreshed_project.slug == "alpha-project"
    assert refreshed_project.icon_glyph == "rocket"
    assert await ProjectRecord.filter(id=disabled_project.id).count() == 0


@pytest.mark.usefixtures("db")
async def test_system_directory_lists_owner_candidates_from_active_org_members_only() -> None:
    acting_admin = await User.create(
        username="owner-candidate-admin",
        email="owner-candidate-admin@example.com",
        display_name="Owner Candidate Admin",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    current_owner = await User.create(
        username="owner-candidate-owner",
        email="owner-candidate-owner@example.com",
        display_name="Current Owner",
        status=UserStatus.ACTIVE,
    )
    member = await User.create(
        username="owner-candidate-member",
        email="owner-candidate-member@example.com",
        display_name="Candidate Member",
        status=UserStatus.ACTIVE,
    )
    disabled_member = await User.create(
        username="owner-candidate-disabled",
        email="owner-candidate-disabled@example.com",
        display_name="Disabled Member",
        status=UserStatus.ACTIVE,
    )
    outsider = await User.create(
        username="owner-candidate-outsider",
        email="owner-candidate-outsider@example.com",
        display_name="Outsider",
        status=UserStatus.ACTIVE,
    )
    organization = await Organization.create(
        name="Candidates Org",
        slug="candidates-org",
        kind=OrganizationKind.TEAM,
        owner_user_id=current_owner.id,
    )
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=current_owner.id,
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
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=disabled_member.id,
        role=OrgRole.ADMIN,
        role_code=OrgRole.ADMIN.value,
        status="disabled",
    )

    app = await _build_app()

    async def _super_admin_override() -> User:
        return acting_admin

    app.dependency_overrides[get_current_user] = _super_admin_override
    app.dependency_overrides[require_super_admin] = _super_admin_override

    async with asgi_client(app) as client:
        candidates_res = await client.get(
            f"/api/v1/system/directory/organizations/{organization.id}/owner-candidates",
        )
        invalid_owner_res = await client.patch(
            f"/api/v1/system/directory/organizations/{organization.id}",
            json={"ownerUserId": str(outsider.id)},
        )

    assert candidates_res.status_code == 200
    assert {item["username"] for item in candidates_res.json()["data"]} == {
        "owner-candidate-owner",
        "owner-candidate-member",
    }
    assert invalid_owner_res.status_code == 400
    assert invalid_owner_res.json()["error"] == "ORGANIZATION_OWNER_MEMBER_REQUIRED"
