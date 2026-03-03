from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.organization import Organization
from apps.api.src.models.organization.user import User
from apps.api.src.models.system.rbac import Role
from apps.api.src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from apps.api.src.modules.auth.http.service import get_current_user, get_current_user_id
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.auth.tokens.service import hash_password

pytestmark = pytest.mark.integration


async def test_workspace_role_policy_endpoints(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        user_repo = UserRepository()
        org = await Organization.create(slug=f"org_{uuid4().hex}", name="Content Org", is_active=True)

        owner_user = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:8]}",
            email=f"owner_{uuid4().hex[:8]}@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_pass_123", settings.auth),
        )
        admin_user = await user_repo.create_user(
            username=f"admin_{uuid4().hex[:8]}",
            email=f"admin_{uuid4().hex[:8]}@example.com",
            display_name="Admin",
            password_hash=hash_password("admin_pass_123", settings.auth),
        )
        member_user_1 = await user_repo.create_user(
            username=f"member1_{uuid4().hex[:8]}",
            email=f"member1_{uuid4().hex[:8]}@example.com",
            display_name="Member 1",
            password_hash=hash_password("member_pass_123", settings.auth),
        )
        member_user_2 = await user_repo.create_user(
            username=f"member2_{uuid4().hex[:8]}",
            email=f"member2_{uuid4().hex[:8]}@example.com",
            display_name="Member 2",
            password_hash=hash_password("member_pass_123", settings.auth),
        )

        for user in (owner_user, admin_user, member_user_1, member_user_2):
            await OrgMembership.create(
                organization_id=org.id,
                user_id=user.id,
                role=OrgRole.OWNER if user.id == owner_user.id else OrgRole.MEMBER,
                role_code=(OrgRole.OWNER.value if user.id == owner_user.id else OrgRole.MEMBER.value),
                status="active",
            )

        workspace = await Workspace.create(
            organization_id=org.id,
            slug="content-workspace",
            name="Content Workspace",
            is_active=True,
            created_by_user_id=owner_user.id,
        )

        owner_role = await Role.get(workspace_id=workspace.id, code="owner")
        admin_role = await Role.get(workspace_id=workspace.id, code="admin")
        viewer_role = await Role.get(workspace_id=workspace.id, code="viewer")
        editor_role = await Role.get(workspace_id=workspace.id, code="editor")

        owner_membership = await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=owner_user.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=None,
        )
        admin_membership = await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=admin_user.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=owner_user.id,
        )
        member_membership_1 = await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=member_user_1.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=owner_user.id,
        )
        member_membership_2 = await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=member_user_2.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=owner_user.id,
        )

        await WorkspaceMembershipRole.get_or_create(membership_id=owner_membership.id, role_id=owner_role.id)
        await WorkspaceMembershipRole.get_or_create(membership_id=admin_membership.id, role_id=admin_role.id)
        await WorkspaceMembershipRole.get_or_create(membership_id=member_membership_1.id, role_id=viewer_role.id)
        await WorkspaceMembershipRole.get_or_create(membership_id=member_membership_2.id, role_id=editor_role.id)

        current_user: User | None = owner_user

        async def _get_user() -> User:
            assert current_user is not None
            return current_user

        async def _get_user_id() -> UUID:
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        ws_pid = encode_uuid(workspace.id)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            get_resp = await client.get(f"/api/v1/workspaces/{ws_pid}/settings/role-policy")
            assert get_resp.status_code == 200, get_resp.text
            assert get_resp.json()["data"]["defaultRoleCode"] == "viewer"

            patch_resp = await client.patch(
                f"/api/v1/workspaces/{ws_pid}/settings/role-policy",
                json={"defaultRoleCode": "editor"},
            )
            assert patch_resp.status_code == 200, patch_resp.text
            assert patch_resp.json()["data"]["defaultRoleCode"] == "editor"

            viewer_role = await Role.get(workspace_id=workspace.id, code="viewer")
            editor_role = await Role.get(workspace_id=workspace.id, code="editor")
            assert bool(editor_role.is_default) is True
            assert bool(viewer_role.is_default) is False

            assign_mismatch = await client.post(
                f"/api/v1/workspaces/{ws_pid}/settings/role-policy/assign-all",
                json={"roleCode": "viewer", "confirmName": "wrong-name"},
            )
            assert assign_mismatch.status_code == 400, assign_mismatch.text
            assert assign_mismatch.json().get("error") == "WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"

            assign_resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/settings/role-policy/assign-all",
                json={"roleCode": "viewer", "confirmName": "Content Workspace"},
            )
            assert assign_resp.status_code == 200, assign_resp.text
            assert assign_resp.json()["data"]["updatedCount"] == 2

            owner_roles = await WorkspaceMembershipRole.filter(membership_id=owner_membership.id).values_list(
                "role__code", flat=True
            )
            admin_roles = await WorkspaceMembershipRole.filter(membership_id=admin_membership.id).values_list(
                "role__code", flat=True
            )
            member1_roles = await WorkspaceMembershipRole.filter(membership_id=member_membership_1.id).values_list(
                "role__code", flat=True
            )
            member2_roles = await WorkspaceMembershipRole.filter(membership_id=member_membership_2.id).values_list(
                "role__code", flat=True
            )

            assert sorted(owner_roles) == ["owner"]
            assert sorted(admin_roles) == ["admin"]
            assert sorted(member1_roles) == ["viewer"]
            assert sorted(member2_roles) == ["viewer"]
