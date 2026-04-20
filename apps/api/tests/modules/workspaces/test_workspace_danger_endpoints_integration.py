from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.system.rbac import Role
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password

pytestmark = pytest.mark.integration


async def test_workspace_leave_and_delete_endpoints(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        user_repo = UserRepository()
        org = await Organization.create(slug=f"org_{uuid4().hex}", name="Ops Org", is_active=True)

        owner1 = await user_repo.create_user(
            username=f"owner1_{uuid4().hex[:8]}",
            email=f"owner1_{uuid4().hex[:8]}@example.com",
            display_name="Owner 1",
            password_hash=hash_password("owner_pass_123", settings.auth),
        )
        owner2 = await user_repo.create_user(
            username=f"owner2_{uuid4().hex[:8]}",
            email=f"owner2_{uuid4().hex[:8]}@example.com",
            display_name="Owner 2",
            password_hash=hash_password("owner_pass_123", settings.auth),
        )

        await OrgMembership.create(
            organization_id=org.id,
            user_id=owner1.id,
            role=OrgRole.OWNER,
            role_code=OrgRole.OWNER.value,
            status="active",
        )
        await OrgMembership.create(
            organization_id=org.id,
            user_id=owner2.id,
            role=OrgRole.OWNER,
            role_code=OrgRole.OWNER.value,
            status="active",
        )

        target_workspace = await Workspace.create(
            organization_id=org.id,
            name="Target Workspace",
            is_active=True,
            created_by_user_id=owner1.id,
        )
        await Workspace.create(
            organization_id=org.id,
            name="Spare Workspace",
            is_active=True,
            created_by_user_id=owner2.id,
        )

        owner1_wsm = await WorkspaceMembership.create(
            workspace_id=target_workspace.id,
            user_id=owner1.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=None,
        )
        owner2_wsm = await WorkspaceMembership.create(
            workspace_id=target_workspace.id,
            user_id=owner2.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=owner1.id,
        )

        owner_role = await Role.get(workspace_id=target_workspace.id, code="owner")
        await WorkspaceMembershipRole.get_or_create(membership_id=owner1_wsm.id, role_id=owner_role.id)
        await WorkspaceMembershipRole.get_or_create(membership_id=owner2_wsm.id, role_id=owner_role.id)

        current_user: User | None = owner1

        async def _get_user() -> User:
            assert current_user is not None
            return current_user

        async def _get_user_id() -> UUID:
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        ws_pid = encode_uuid(target_workspace.id)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            leave_resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/leave",
                json={"confirmText": "LEAVE"},
            )
            assert leave_resp.status_code == 200, leave_resp.text
            assert leave_resp.json()["data"]["left"] is True
            assert await WorkspaceMembership.get_or_none(id=owner1_wsm.id) is None

            current_user = owner2
            leave_last_owner = await client.post(
                f"/api/v1/workspaces/{ws_pid}/leave",
                json={"confirmText": "LEAVE"},
            )
            assert leave_last_owner.status_code == 403, leave_last_owner.text
            assert leave_last_owner.json().get("error") == "WORKSPACE_OWNER_AT_LEAST_ONE_REQUIRED"

            delete_invalid = await client.delete(
                f"/api/v1/workspaces/{ws_pid}",
                params={"confirmName": "wrong"},
            )
            assert delete_invalid.status_code == 400, delete_invalid.text
            assert delete_invalid.json().get("error") == "WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"

            delete_resp = await client.delete(
                f"/api/v1/workspaces/{ws_pid}",
                params={"confirmName": "Target Workspace"},
            )
            assert delete_resp.status_code == 200, delete_resp.text
            assert delete_resp.json()["data"]["deleted"] is True
            assert await Workspace.get_or_none(id=target_workspace.id) is None


@pytest.mark.asyncio
async def test_workspace_danger_capabilities_report_constraints(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        user_repo = UserRepository()
        org = await Organization.create(slug=f"org_{uuid4().hex}", name="Ops Org", is_active=True)

        owner1 = await user_repo.create_user(
            username=f"owner1_{uuid4().hex[:8]}",
            email=f"owner1_{uuid4().hex[:8]}@example.com",
            display_name="Owner 1",
            password_hash=hash_password("owner_pass_123", settings.auth),
        )
        owner2 = await user_repo.create_user(
            username=f"owner2_{uuid4().hex[:8]}",
            email=f"owner2_{uuid4().hex[:8]}@example.com",
            display_name="Owner 2",
            password_hash=hash_password("owner_pass_123", settings.auth),
        )
        member = await user_repo.create_user(
            username=f"member_{uuid4().hex[:8]}",
            email=f"member_{uuid4().hex[:8]}@example.com",
            display_name="Member",
            password_hash=hash_password("member_pass_123", settings.auth),
        )

        for user, role in ((owner1, OrgRole.OWNER), (owner2, OrgRole.OWNER), (member, OrgRole.MEMBER)):
            await OrgMembership.create(
                organization_id=org.id,
                user_id=user.id,
                role=role,
                role_code=role.value,
                status="active",
            )

        target_workspace = await Workspace.create(
            organization_id=org.id,
            name="Target Workspace",
            is_active=True,
            created_by_user_id=owner1.id,
        )
        spare_workspace = await Workspace.create(
            organization_id=org.id,
            name="Spare Workspace",
            is_active=True,
            created_by_user_id=owner2.id,
        )

        owner1_target = await WorkspaceMembership.create(
            workspace_id=target_workspace.id,
            user_id=owner1.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=None,
        )
        owner2_target = await WorkspaceMembership.create(
            workspace_id=target_workspace.id,
            user_id=owner2.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=owner1.id,
        )
        member_target = await WorkspaceMembership.create(
            workspace_id=target_workspace.id,
            user_id=member.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=owner1.id,
        )
        owner2_spare = await WorkspaceMembership.create(
            workspace_id=spare_workspace.id,
            user_id=owner2.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=None,
        )

        owner_role_target = await Role.get(workspace_id=target_workspace.id, code="owner")
        owner_role_spare = await Role.get(workspace_id=spare_workspace.id, code="owner")
        await WorkspaceMembershipRole.get_or_create(membership_id=owner1_target.id, role_id=owner_role_target.id)
        await WorkspaceMembershipRole.get_or_create(membership_id=owner2_target.id, role_id=owner_role_target.id)
        await WorkspaceMembershipRole.get_or_create(membership_id=owner2_spare.id, role_id=owner_role_spare.id)

        current_user: User | None = owner1

        async def _get_user() -> User:
            assert current_user is not None
            return current_user

        async def _get_user_id() -> UUID:
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        target_pid = encode_uuid(target_workspace.id)
        spare_pid = encode_uuid(spare_workspace.id)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            owner_cap_resp = await client.get(f"/api/v1/workspaces/{target_pid}/danger-capabilities")
            assert owner_cap_resp.status_code == 200, owner_cap_resp.text
            owner_cap = owner_cap_resp.json()["data"]
            assert owner_cap["leaveAction"]["enabled"] is True
            assert owner_cap["deleteAction"]["enabled"] is True

            current_user = member
            member_cap_resp = await client.get(f"/api/v1/workspaces/{target_pid}/danger-capabilities")
            assert member_cap_resp.status_code == 200, member_cap_resp.text
            member_cap = member_cap_resp.json()["data"]
            assert member_cap["leaveAction"]["enabled"] is True
            assert member_cap["deleteAction"]["enabled"] is False
            assert member_cap["deleteAction"]["blockedReason"] == "WORKSPACE_SETTINGS_MANAGE_REQUIRED"

            current_user = owner1
            leave_resp = await client.post(
                f"/api/v1/workspaces/{target_pid}/leave",
                json={"confirmText": "LEAVE"},
            )
            assert leave_resp.status_code == 200, leave_resp.text
            assert await WorkspaceMembership.get_or_none(id=owner1_target.id) is None

            current_user = owner2
            last_owner_cap_resp = await client.get(f"/api/v1/workspaces/{target_pid}/danger-capabilities")
            assert last_owner_cap_resp.status_code == 200, last_owner_cap_resp.text
            last_owner_cap = last_owner_cap_resp.json()["data"]
            assert last_owner_cap["leaveAction"]["enabled"] is False
            assert last_owner_cap["leaveAction"]["blockedReason"] == "WORKSPACE_OWNER_AT_LEAST_ONE_REQUIRED"
            assert last_owner_cap["deleteAction"]["enabled"] is True

            delete_target_resp = await client.delete(
                f"/api/v1/workspaces/{target_pid}",
                params={"confirmName": "Target Workspace"},
            )
            assert delete_target_resp.status_code == 200, delete_target_resp.text

            spare_cap_resp = await client.get(f"/api/v1/workspaces/{spare_pid}/danger-capabilities")
            assert spare_cap_resp.status_code == 200, spare_cap_resp.text
            spare_cap = spare_cap_resp.json()["data"]
            assert spare_cap["deleteAction"]["enabled"] is False
            assert spare_cap["deleteAction"]["blockedReason"] == "LAST_ACTIVE_WORKSPACE_NOT_DELETABLE"
