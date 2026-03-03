from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.organization import Organization
from apps.api.src.models.organization.user import User
from apps.api.src.models.system.setting import SettingRecord
from apps.api.src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from apps.api.src.modules.auth.http.service import get_current_user, get_current_user_id
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.auth.tokens.service import hash_password
from apps.api.src.modules.organization.repository import OrganizationRepository
from apps.api.src.settings.scopes import SCOPE_TYPE_ORG

pytestmark = pytest.mark.integration


async def test_organization_settings_assign_leave_and_delete(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Acme Org")

        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:8]}",
            email=f"owner_{uuid4().hex[:8]}@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_pass_123", settings.auth),
        )
        admin = await user_repo.create_user(
            username=f"admin_{uuid4().hex[:8]}",
            email=f"admin_{uuid4().hex[:8]}@example.com",
            display_name="Admin",
            password_hash=hash_password("admin_pass_123", settings.auth),
        )
        member = await user_repo.create_user(
            username=f"member_{uuid4().hex[:8]}",
            email=f"member_{uuid4().hex[:8]}@example.com",
            display_name="Member",
            password_hash=hash_password("member_pass_123", settings.auth),
        )

        owner_orgm = await OrgMembership.create(
            organization_id=org.id,
            user_id=owner.id,
            role=OrgRole.OWNER,
            role_code=OrgRole.OWNER.value,
            status="active",
        )
        await OrgMembership.create(
            organization_id=org.id,
            user_id=admin.id,
            role=OrgRole.ADMIN,
            role_code=OrgRole.ADMIN.value,
            status="active",
        )
        member_orgm = await OrgMembership.create(
            organization_id=org.id,
            user_id=member.id,
            role=OrgRole.MEMBER,
            role_code=OrgRole.MEMBER.value,
            status="active",
        )

        ws = await Workspace.create(
            organization_id=org.id,
            slug="default",
            name="Default",
            is_active=True,
            created_by_user_id=owner.id,
        )
        await WorkspaceMembership.create(
            workspace_id=ws.id,
            user_id=owner.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=None,
        )
        await WorkspaceMembership.create(
            workspace_id=ws.id,
            user_id=member.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=owner.id,
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
            get_resp = await client.get("/api/v1/organizations/me/settings/core")
            assert get_resp.status_code == 200, get_resp.text
            assert get_resp.json()["data"]["organizationName"] == "Acme Org"
            assert get_resp.json()["data"]["defaultRoleCode"] == "member"

            patch_resp = await client.patch(
                "/api/v1/organizations/me/settings/core",
                json={
                    "organizationName": "Acme Organization",
                    "organizationLocalization": {
                        "locale": "en-US",
                        "timezone": "UTC",
                        "dateFormat": "MM/DD/YYYY",
                    },
                    "defaultRoleCode": "admin",
                },
            )
            assert patch_resp.status_code == 200, patch_resp.text
            patched = patch_resp.json()["data"]
            assert patched["organizationName"] == "Acme Organization"
            assert patched["organizationLocalization"]["locale"] == "en-US"
            assert patched["defaultRoleCode"] == "admin"

            assign_resp = await client.post(
                "/api/v1/organizations/me/settings/default-role/assign-all",
                json={"roleCode": "admin", "confirmName": "Acme Organization"},
            )
            assert assign_resp.status_code == 200, assign_resp.text
            assert assign_resp.json()["data"]["updatedCount"] == 1

            await member_orgm.refresh_from_db()
            assert member_orgm.role == OrgRole.ADMIN
            assert member_orgm.role_code == "admin"

            current_user = member
            leave_resp = await client.post(
                "/api/v1/organizations/me/leave",
                json={"confirmText": "LEAVE"},
            )
            assert leave_resp.status_code == 200, leave_resp.text
            assert leave_resp.json()["data"]["left"] is True
            assert await OrgMembership.get_or_none(id=member_orgm.id) is None

            current_user = owner
            delete_invalid = await client.delete(
                "/api/v1/organizations/me",
                params={"confirmName": "wrong-name"},
            )
            assert delete_invalid.status_code == 400, delete_invalid.text
            assert delete_invalid.json().get("error") == "ORG_DELETE_CONFIRM_NAME_MISMATCH"

            delete_resp = await client.delete(
                "/api/v1/organizations/me",
                params={"confirmName": "Acme Organization"},
            )
            assert delete_resp.status_code == 200, delete_resp.text
            assert delete_resp.json()["data"]["deleted"] is True
            assert await Organization.get_or_none(id=org.id) is None
            assert (
                await SettingRecord.filter(
                    scope_type=SCOPE_TYPE_ORG,
                    scope_id=org.id,
                    namespace="core",
                ).exists()
                is False
            )

            # Owner membership is deleted via organization cascade.
            assert await OrgMembership.get_or_none(id=owner_orgm.id) is None
