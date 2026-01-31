from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.infra.db.orm import verify_db_ready
from apps.api.routers.v1.auth.deps import get_current_user_id

pytestmark = pytest.mark.integration


async def test_team_invitation_accept_flow(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.core.rbac.constants import ROLE_ADMIN
        from apps.api.core.rbac.repository import RBACRepository
        from apps.api.models.organization import Membership, MembershipStatus
        from apps.api.models.rbac import MembershipRole
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        user_repo = UserRepository()
        org_repo = OrganizationRepository()
        rbac_repo = RBACRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")

        # Create an admin user for calling /admin/** endpoints.
        admin_username = f"admin_{uuid4().hex}"
        admin = await user_repo.create_user(
            username=admin_username,
            email=None,
            display_name="Admin",
            password_hash=hash_password("admin_password_123", settings.auth),
        )
        role_admin = await rbac_repo.get_role_by_code(ROLE_ADMIN)
        assert role_admin is not None
        admin_membership = await rbac_repo.ensure_membership(user_id=admin.id, organization_id=org.id)
        await rbac_repo.assign_membership_role(membership_id=admin_membership.id, role=role_admin)

        async def _current_user_id():
            return admin.id

        app.dependency_overrides[get_current_user_id] = _current_user_id

        headers = {"X-Org-Id": str(org.id)}

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1) Admin creates an invitation.
            invite_email = f"{uuid4().hex}@example.com"
            resp = await client.post(
                "/api/v1/admin/team/invitations",
                headers=headers,
                json={
                    "email": invite_email,
                    "roleCode": "admin",
                    "expiresInSeconds": 3600,
                },
            )
            assert resp.status_code == 200
            created = resp.json()["data"]
            token = created["token"]
            invitation = created["invitation"]
            assert invitation["email"] == invite_email
            assert invitation["roleCode"] == "admin"
            assert invitation["status"] == "pending"

            # 2) List invitations should include the new one.
            resp = await client.get("/api/v1/admin/team/invitations?page=1&size=10", headers=headers)
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] >= 1
            assert any(item["id"] == invitation["id"] for item in page["items"])

            # 3) Invitee accepts invitation and gets tokens.
            # Must satisfy RegisterRequest username constraints: 6-18 chars.
            username = f"user{uuid4().hex[:10]}"
            password = "user_password_123"
            resp = await client.post(
                "/api/v1/auth/invitations/accept",
                json={
                    "token": token,
                    "username": username,
                    "password": password,
                    "confirmPassword": password,
                    "displayName": "Invited User",
                },
            )
            assert resp.status_code == 200
            tokens = resp.json()["data"]
            assert tokens["accessToken"]
            assert tokens["refreshToken"]

            # 4) New user can query profile and org memberships.
            auth_headers = {"Authorization": f"Bearer {tokens['accessToken']}"}
            resp = await client.get("/api/v1/auth/me", headers=auth_headers)
            assert resp.status_code == 200
            me = resp.json()["data"]
            assert me["username"] == username
            assert me["email"] == invite_email

            resp = await client.get("/api/v1/auth/me/orgs", headers=auth_headers)
            assert resp.status_code == 200
            orgs = resp.json()["data"]
            assert any(item["organizationId"] == str(org.id) for item in orgs["items"])

            # 5) New user can access org-scoped authz (admin:access).
            resp = await client.get(
                "/api/v1/auth/me/authz",
                headers={**auth_headers, **headers},
            )
            assert resp.status_code == 200
            authz = resp.json()["data"]
            assert "admin" in authz["roleCodes"]
            assert "admin:access" in authz["permissionCodes"]

            # 6) Invitation becomes accepted; revoking should fail.
            resp = await client.post(
                f"/api/v1/admin/team/invitations/{invitation['id']}/revoke",
                headers=headers,
            )
            assert resp.status_code == 400

            # 7) Filter invitations by status=accepted should include the used invitation.
            resp = await client.get(
                "/api/v1/admin/team/invitations?page=1&size=10&status=accepted",
                headers=headers,
            )
            assert resp.status_code == 200
            accepted_page = resp.json()["data"]
            assert any(item["id"] == invitation["id"] for item in accepted_page["items"])

            # 8) Link management: renew + delete (only allowed for not-accepted invitations).
            invite_email2 = f"{uuid4().hex}@example.com"
            resp = await client.post(
                "/api/v1/admin/team/invitations",
                headers=headers,
                json={
                    "email": invite_email2,
                    "roleCode": "admin",
                    "expiresInSeconds": 3600,
                },
            )
            assert resp.status_code == 200
            created2 = resp.json()["data"]
            invitation2 = created2["invitation"]
            old_expires_at = invitation2.get("expiresAt")

            resp = await client.post(
                f"/api/v1/admin/team/invitations/{invitation2['id']}/renew",
                headers=headers,
                json={"expiresInSeconds": 7200},
            )
            assert resp.status_code == 200
            renewed = resp.json()["data"]
            assert renewed["id"] == invitation2["id"]
            assert renewed["email"] == invite_email2
            assert renewed["status"] == "pending"
            assert renewed.get("expiresAt") != old_expires_at

            resp = await client.delete(
                f"/api/v1/admin/team/invitations/{invitation2['id']}",
                headers=headers,
            )
            assert resp.status_code == 200

            resp = await client.get(
                f"/api/v1/admin/team/invitations?page=1&size=10&q={invite_email2}",
                headers=headers,
            )
            assert resp.status_code == 200
            deleted_page = resp.json()["data"]
            assert all(item["id"] != invitation2["id"] for item in deleted_page["items"])

        # DB-level sanity checks (membership + role binding).
        invited_user = await user_repo.get_by_identifier(username)
        assert invited_user is not None
        membership = await Membership.get_or_none(user_id=invited_user.id, organization_id=org.id)
        assert membership is not None
        assert membership.status == MembershipStatus.ACTIVE
        assert await MembershipRole.filter(membership_id=membership.id, role_id=role_admin.id).exists()
