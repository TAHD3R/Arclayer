from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.common.utils.public_ids import encode_uuid
from apps.api.config import get_settings
from apps.api.core.database.orm import verify_db_ready
from apps.api.core.registry import create_app
from apps.api.modules.auth.deps import get_current_user, get_current_user_id
from apps.api.modules.auth.repository import UserRepository
from apps.api.modules.auth.security import hash_password
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.organization.models.organization import Organization
from apps.api.modules.organization.models.user import User
from apps.api.modules.system.models.rbac import Role
from apps.api.modules.workspaces.models.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)

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
            slug="target",
            name="Target Workspace",
            is_active=True,
            created_by_user_id=owner1.id,
        )
        await Workspace.create(
            organization_id=org.id,
            slug="spare",
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
