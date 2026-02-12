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
from apps.api.modules.organization.models.user import User
from apps.api.modules.organization.repository import OrganizationRepository
from apps.api.modules.workspaces.models.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipStatus,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_org_workspace_endpoints_list_create_archive_delete_and_guards(
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

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org")
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
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        await OrgMembership.create(organization_id=org.id, user_id=admin.id, role=OrgRole.ADMIN, status="active")

        default_workspace = await Workspace.create(
            organization_id=org.id,
            slug="default",
            name="Default",
            is_active=True,
            created_by_user_id=owner.id,
        )
        await WorkspaceMembership.create(
            workspace_id=default_workspace.id,
            user_id=owner.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=None,
        )
        await WorkspaceMembership.create(
            workspace_id=default_workspace.id,
            user_id=admin.id,
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
            list_resp = await client.get("/api/v1/organizations/me/workspaces")
            assert list_resp.status_code == 200, list_resp.text
            listed = list_resp.json()["data"]
            assert listed["total"] == 1
            assert listed["items"][0]["workspaceId"] == encode_uuid(default_workspace.id)
            assert listed["items"][0]["isArchived"] is False

            create_resp = await client.post(
                "/api/v1/organizations/me/workspaces",
                json={"name": "Blog Team", "description": "Marketing and content", "template": "blog"},
            )
            assert create_resp.status_code == 200, create_resp.text
            created = create_resp.json()["data"]
            created_workspace_id = created["workspaceId"]
            assert created["name"] == "Blog Team"
            assert created["description"] == "Marketing and content"

            archive_resp = await client.post(
                f"/api/v1/organizations/me/workspaces/{created_workspace_id}/archive"
            )
            assert archive_resp.status_code == 200, archive_resp.text
            assert archive_resp.json()["data"]["isArchived"] is True

            post_archive_list = await client.get("/api/v1/organizations/me/workspaces")
            assert post_archive_list.status_code == 200, post_archive_list.text
            post_archive_items = post_archive_list.json()["data"]["items"]
            assert len(post_archive_items) == 2
            assert post_archive_items[0]["isArchived"] is False
            assert post_archive_items[-1]["workspaceId"] == created_workspace_id
            assert post_archive_items[-1]["isArchived"] is True

            ordered_workspaces_desc = await client.get(
                "/api/v1/organizations/me/workspaces",
                params={"ordering": "-created_at"},
            )
            assert ordered_workspaces_desc.status_code == 200, ordered_workspaces_desc.text
            ordered_workspace_items = ordered_workspaces_desc.json()["data"]["items"]
            assert ordered_workspace_items[0]["workspaceId"] == created_workspace_id
            assert ordered_workspace_items[-1]["workspaceId"] == encode_uuid(default_workspace.id)

            members_resp = await client.get(
                f"/api/v1/organizations/me/workspaces/{encode_uuid(default_workspace.id)}/members"
            )
            assert members_resp.status_code == 200, members_resp.text
            members_payload = members_resp.json()["data"]
            assert members_payload["total"] == 2
            assert len(members_payload["items"]) == 2

            search_resp = await client.get(
                f"/api/v1/organizations/me/workspaces/{encode_uuid(default_workspace.id)}/members",
                params={"q": admin.username},
            )
            assert search_resp.status_code == 200, search_resp.text
            assert search_resp.json()["data"]["total"] == 1

            unarchive_resp = await client.post(
                f"/api/v1/organizations/me/workspaces/{created_workspace_id}/unarchive"
            )
            assert unarchive_resp.status_code == 200, unarchive_resp.text
            assert unarchive_resp.json()["data"]["isArchived"] is False

            current_user = admin
            delete_as_admin = await client.delete(
                f"/api/v1/organizations/me/workspaces/{created_workspace_id}",
                params={"confirmName": "Blog Team"},
            )
            assert delete_as_admin.status_code == 403, delete_as_admin.text
            assert delete_as_admin.json().get("error") == "ORG_OWNER_REQUIRED"

            current_user = owner
            delete_missing_confirm = await client.delete(
                f"/api/v1/organizations/me/workspaces/{created_workspace_id}"
            )
            assert delete_missing_confirm.status_code == 400, delete_missing_confirm.text
            assert delete_missing_confirm.json().get("error") == "WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"

            delete_wrong_confirm = await client.delete(
                f"/api/v1/organizations/me/workspaces/{created_workspace_id}",
                params={"confirmName": "wrong name"},
            )
            assert delete_wrong_confirm.status_code == 400, delete_wrong_confirm.text
            assert delete_wrong_confirm.json().get("error") == "WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"

            delete_resp = await client.delete(
                f"/api/v1/organizations/me/workspaces/{created_workspace_id}",
                params={"confirmName": "Blog Team"},
            )
            assert delete_resp.status_code == 200, delete_resp.text
            assert delete_resp.json()["data"]["deleted"] is True

            delete_last_resp = await client.delete(
                f"/api/v1/organizations/me/workspaces/{encode_uuid(default_workspace.id)}",
                params={"confirmName": "Default"},
            )
            assert delete_last_resp.status_code == 400, delete_last_resp.text
            assert delete_last_resp.json().get("error") == "LAST_ACTIVE_WORKSPACE_NOT_DELETABLE"


@pytest.mark.asyncio
async def test_org_members_endpoints_invite_and_role_update(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org")

        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:8]}",
            email=f"owner_{uuid4().hex[:8]}@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_pass_123", settings.auth),
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
            status="active",
        )
        member_orgm = await OrgMembership.create(
            organization_id=org.id,
            user_id=member.id,
            role=OrgRole.MEMBER,
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
            current_user = member
            denied = await client.post(
                "/api/v1/organizations/me/workspaces",
                json={"name": "Forbidden"},
            )
            assert denied.status_code == 403, denied.text
            assert denied.json().get("error") == "ORG_ADMIN_REQUIRED"

            current_user = owner
            list_members = await client.get("/api/v1/organizations/me/members")
            assert list_members.status_code == 200, list_members.text
            payload = list_members.json()["data"]
            assert payload["total"] == 2
            member_row = next((row for row in payload["items"] if row["membershipId"] == encode_uuid(member_orgm.id)), None)
            assert member_row is not None
            assert member_row["workspaceCount"] == 1
            assert len(member_row["workspaces"]) == 1

            ordered_members_asc = await client.get(
                "/api/v1/organizations/me/members",
                params={"ordering": "username"},
            )
            assert ordered_members_asc.status_code == 200, ordered_members_asc.text
            ordered_members_asc_items = ordered_members_asc.json()["data"]["items"]
            assert ordered_members_asc_items[0]["username"].startswith("member_")

            ordered_members_desc = await client.get(
                "/api/v1/organizations/me/members",
                params={"ordering": "-username"},
            )
            assert ordered_members_desc.status_code == 200, ordered_members_desc.text
            ordered_members_desc_items = ordered_members_desc.json()["data"]["items"]
            assert ordered_members_desc_items[0]["username"].startswith("owner_")

            role_update = await client.patch(
                f"/api/v1/organizations/me/members/{encode_uuid(member_orgm.id)}/role",
                json={"role": "admin"},
            )
            assert role_update.status_code == 200, role_update.text
            assert role_update.json()["data"]["role"] == "admin"

            create_custom_role = await client.post(
                "/api/v1/organizations/me/rbac/roles",
                json={
                    "name": "Ops Manager",
                    "code": "ops_manager",
                    "templateRoleCode": "member",
                },
            )
            assert create_custom_role.status_code == 200, create_custom_role.text
            assert create_custom_role.json()["data"]["code"] == "ops_manager"

            grant_create_invite = await client.put(
                "/api/v1/organizations/me/rbac/permissions/org.invitations.create/roles",
                json={"roleCodes": ["ops_manager"]},
            )
            assert grant_create_invite.status_code == 200, grant_create_invite.text

            set_member_custom_role = await client.patch(
                f"/api/v1/organizations/me/members/{encode_uuid(member_orgm.id)}/role",
                json={"roleCode": "ops_manager"},
            )
            assert set_member_custom_role.status_code == 200, set_member_custom_role.text
            assert set_member_custom_role.json()["data"]["role"] == "member"
            assert set_member_custom_role.json()["data"]["roleCode"] == "ops_manager"

            current_user = member
            custom_role_invite_resp = await client.post(
                "/api/v1/organizations/me/invitations",
                json={"email": f"custom_{uuid4().hex[:8]}@example.com", "roleCode": "member"},
            )
            assert custom_role_invite_resp.status_code == 200, custom_role_invite_resp.text

            member_write_roles_denied = await client.post(
                "/api/v1/organizations/me/rbac/roles",
                json={"name": "Blocked", "code": "blocked_role"},
            )
            assert member_write_roles_denied.status_code == 403, member_write_roles_denied.text
            assert member_write_roles_denied.json().get("error") == "ORG_ROLES_WRITE_REQUIRED"

            current_user = owner

            invite_resp = await client.post(
                "/api/v1/organizations/me/invitations",
                json={"email": f"invite_{uuid4().hex[:8]}@example.com", "roleCode": "member"},
            )
            assert invite_resp.status_code == 200, invite_resp.text
            invite_payload = invite_resp.json()["data"]
            assert invite_payload["roleCode"] == "member"
            assert invite_payload["token"]
            assert invite_payload["email"].endswith("@example.com")

            ordered_email_low = f"a_order_{uuid4().hex[:6]}@ordering.example.com"
            ordered_email_high = f"z_order_{uuid4().hex[:6]}@ordering.example.com"
            ordered_invite_low_resp = await client.post(
                "/api/v1/organizations/me/invitations",
                json={"email": ordered_email_low, "roleCode": "member"},
            )
            assert ordered_invite_low_resp.status_code == 200, ordered_invite_low_resp.text
            ordered_invite_high_resp = await client.post(
                "/api/v1/organizations/me/invitations",
                json={"email": ordered_email_high, "roleCode": "member"},
            )
            assert ordered_invite_high_resp.status_code == 200, ordered_invite_high_resp.text

            list_invites_resp = await client.get("/api/v1/organizations/me/invitations")
            assert list_invites_resp.status_code == 200, list_invites_resp.text
            list_invites_payload = list_invites_resp.json()["data"]
            assert list_invites_payload["total"] >= 1
            assert list_invites_payload["items"][0]["invitationType"] == "email"
            invitation_id = invite_payload["invitationId"]

            ordered_invites_asc_resp = await client.get(
                "/api/v1/organizations/me/invitations",
                params={"q": "ordering.example.com", "ordering": "email"},
            )
            assert ordered_invites_asc_resp.status_code == 200, ordered_invites_asc_resp.text
            ordered_invites_asc_items = ordered_invites_asc_resp.json()["data"]["items"]
            assert ordered_invites_asc_items[0]["email"] == ordered_email_low

            ordered_invites_desc_resp = await client.get(
                "/api/v1/organizations/me/invitations",
                params={"q": "ordering.example.com", "ordering": "-email"},
            )
            assert ordered_invites_desc_resp.status_code == 200, ordered_invites_desc_resp.text
            ordered_invites_desc_items = ordered_invites_desc_resp.json()["data"]["items"]
            assert ordered_invites_desc_items[0]["email"] == ordered_email_high

            create_link_resp = await client.post(
                "/api/v1/organizations/me/invitations/links",
                json={"roleCode": "member", "maxUses": 3},
            )
            assert create_link_resp.status_code == 200, create_link_resp.text
            link_payload = create_link_resp.json()["data"]
            assert link_payload["link"]["displayCode"]
            assert link_payload["token"]

            create_link_resp_latest = await client.post(
                "/api/v1/organizations/me/invitations/links",
                json={"roleCode": "member", "maxUses": 3},
            )
            assert create_link_resp_latest.status_code == 200, create_link_resp_latest.text
            latest_link_payload = create_link_resp_latest.json()["data"]

            list_links_resp = await client.get("/api/v1/organizations/me/invitations/links")
            assert list_links_resp.status_code == 200, list_links_resp.text
            assert list_links_resp.json()["data"]["total"] >= 1

            ordered_links_desc_resp = await client.get(
                "/api/v1/organizations/me/invitations/links",
                params={"ordering": "-created_at"},
            )
            assert ordered_links_desc_resp.status_code == 200, ordered_links_desc_resp.text
            ordered_links_desc_items = ordered_links_desc_resp.json()["data"]["items"]
            assert ordered_links_desc_items[0]["id"] == latest_link_payload["link"]["id"]

            link_id = link_payload["link"]["id"]
            renew_link_resp = await client.post(
                f"/api/v1/organizations/me/invitations/links/{link_id}/renew",
                json={"expiresInSeconds": 24 * 60 * 60},
            )
            assert renew_link_resp.status_code == 200, renew_link_resp.text

            disable_link_resp = await client.post(
                f"/api/v1/organizations/me/invitations/links/{link_id}/disable",
            )
            assert disable_link_resp.status_code == 200, disable_link_resp.text

            renew_resp = await client.post(
                f"/api/v1/organizations/me/invitations/{invitation_id}/renew",
                json={"expiresInSeconds": 24 * 60 * 60},
            )
            assert renew_resp.status_code == 200, renew_resp.text
            assert renew_resp.json()["data"]["token"]

            revoke_resp = await client.post(
                f"/api/v1/organizations/me/invitations/{invitation_id}/revoke",
            )
            assert revoke_resp.status_code == 200, revoke_resp.text
            assert revoke_resp.json()["data"]["revoked"] is True

            owner_self_remove = await client.delete(
                f"/api/v1/organizations/me/members/{encode_uuid(owner_orgm.id)}"
            )
            assert owner_self_remove.status_code == 403, owner_self_remove.text
            assert owner_self_remove.json().get("error") == "ORG_OWNER_SELF_REMOVE_FORBIDDEN"
