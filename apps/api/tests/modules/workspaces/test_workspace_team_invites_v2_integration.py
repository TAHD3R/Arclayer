from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.modules.auth.deps import get_current_user, get_current_user_id

pytestmark = pytest.mark.integration


class _CredentialWithHash(Protocol):
    password_hash: str


class _UserWithCredential(Protocol):
    credential: _CredentialWithHash | None
    token_version: int | None


async def _enable_mail_service() -> None:
    """
    Enable email sending via system-scoped core settings.

    Notes:
    - Workspace email invites are designed to be delivered by email; the API fails fast when mail is disabled.
    - Tests should enable mail explicitly to avoid coupling to default bootstrap values.
    """

    from apps.api.src.modules.system.models.setting import SettingRecord
    from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
    from apps.api.src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

    record = await SettingRecord.get_or_none(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    )
    if record is None:
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
            value={"mail": {"enabled": True}},
        )
        return

    value = record.value if isinstance(record.value, dict) else {}
    mail_raw = value.get("mail")
    mail_cfg = mail_raw if isinstance(mail_raw, dict) else {}
    mail_cfg["enabled"] = True
    value["mail"] = mail_cfg
    record.value = value
    await record.save(update_fields=["value", "updated_at"])


async def test_me_workspaces_owner_can_see_all_with_visible_only(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.security import hash_password
        from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.src.modules.organization.models.user import User
        from apps.api.src.modules.organization.repository import OrganizationRepository
        from apps.api.src.modules.workspaces.models.workspace import Workspace

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        other = await user_repo.create_user(
            username=f"other_{uuid4().hex[:10]}",
            email="other@example.com",
            display_name="Other",
            password_hash=hash_password("other_password_123", settings.auth),
        )

        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        await OrgMembership.create(organization_id=org.id, user_id=other.id, role=OrgRole.MEMBER, status="active")

        ws1 = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Blog",
            is_active=True,
            created_by_user_id=owner.id,
        )
        ws2 = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Commerce",
            is_active=True,
            created_by_user_id=other.id,
        )

        current_user: User | None = owner

        async def _get_user():
            assert current_user is not None
            return current_user

        async def _get_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            resp = await client.get("/api/v1/me/workspaces")
            assert resp.status_code == 200
            items = resp.json()["data"]["items"]
            ids = {i["workspaceId"] for i in items}
            ws1_pid = encode_uuid(ws1.id)
            ws2_pid = encode_uuid(ws2.id)
            assert ids == {ws1_pid, ws2_pid}

            by_id = {i["workspaceId"]: i for i in items}
            assert by_id[ws1_pid]["isCreatorAdmin"] is True
            assert by_id[ws1_pid]["visibleOnly"] is False
            assert by_id[ws2_pid]["isCreatorAdmin"] is False
            assert by_id[ws2_pid]["visibleOnly"] is True


async def test_workspace_invite_link_accept_existing_creates_use_event(
    prepared_db, integration_valkey_settings
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.security import hash_password
        from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.src.modules.organization.models.user import User
        from apps.api.src.modules.organization.repository import OrganizationRepository
        from apps.api.src.modules.system.models.rbac import Role
        from apps.api.src.modules.workspaces.models.workspace import Workspace
        from apps.api.src.modules.workspaces.models.workspace_invite import WorkspaceInviteLinkUseEvent

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")

        # Inviter: org owner + workspace creator -> implicit admin.
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")

        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Blog",
            is_active=True,
            created_by_user_id=owner.id,
        )

        # Invitee: existing user (no org membership yet).
        invitee = await user_repo.create_user(
            username=f"invitee_{uuid4().hex[:10]}",
            email="invitee@example.com",
            display_name="Invitee",
            password_hash=hash_password("invitee_password_123", settings.auth),
        )

        # Dynamic auth override.
        current_user: User | None = None

        async def _get_user():
            assert current_user is not None
            return current_user

        async def _get_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        role_admin = await Role.get_or_none(code="admin")
        assert role_admin is not None

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            ws_pid = encode_uuid(ws.id)
            invitee_pid = encode_uuid(invitee.id)

            # 1) Owner creates a reusable invite link with domain restriction.
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                json={
                    "roleCode": "admin",
                    "expiresInSeconds": 3600,
                    "maxUses": 10,
                    "allowedEmailDomain": "example.com",
                },
            )
            assert resp.status_code == 200
            created = resp.json()["data"]
            token = created["token"]
            assert token

            # 2) Invitee accepts the link with an existing account.
            current_user = invitee
            resp = await client.post(
                "/api/v1/auth/invitations/accept-existing",
                json={"token": token},
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["organizationId"] == encode_uuid(org.id)
            assert data["workspaceId"] == ws_pid

            # Workspace invitation role should never overwrite organization-level role code.
            orgm = await OrgMembership.get_or_none(organization_id=org.id, user_id=invitee.id)
            assert orgm is not None
            assert orgm.role == OrgRole.MEMBER
            assert orgm.role_code == OrgRole.MEMBER.value

            # 3) Link use event should be created.
            assert await WorkspaceInviteLinkUseEvent.filter(used_by_user_id=invitee.id).exists()

            # 4) Owner can list links and see participants.
            current_user = owner
            resp = await client.get(f"/api/v1/workspaces/{ws_pid}/team/invite-links?page=1&size=10")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] >= 1
            link = page["items"][0]
            assert link["usesCount"] >= 1
            assert any(p["user"]["userId"] == invitee_pid for p in (link.get("recentParticipants") or []))

            # 5) Participants endpoint should paginate full usage events.
            resp = await client.get(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links/{link['id']}/participants?page=1&size=10"
            )
            assert resp.status_code == 200
            participants = resp.json()["data"]
            assert participants["total"] >= 1
            assert any(p["user"]["userId"] == invitee_pid for p in participants["items"])


async def test_workspace_invite_link_max_uses_enforced(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.security import hash_password
        from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.src.modules.organization.models.user import User
        from apps.api.src.modules.organization.repository import OrganizationRepository
        from apps.api.src.modules.workspaces.models.workspace import Workspace

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=owner.id,
        )

        invitee1 = await user_repo.create_user(
            username=f"invitee1_{uuid4().hex[:10]}",
            email="invitee1@example.com",
            display_name="Invitee1",
            password_hash=hash_password("invitee_password_123", settings.auth),
        )
        invitee2 = await user_repo.create_user(
            username=f"invitee2_{uuid4().hex[:10]}",
            email="invitee2@example.com",
            display_name="Invitee2",
            password_hash=hash_password("invitee_password_123", settings.auth),
        )

        current_user: User | None = None

        async def _get_user():
            assert current_user is not None
            return current_user

        async def _get_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            ws_pid = encode_uuid(ws.id)
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                json={
                    "roleCode": "admin",
                    "expiresInSeconds": 3600,
                    "maxUses": 1,
                    "allowedEmailDomain": "example.com",
                },
            )
            assert resp.status_code == 200
            token = resp.json()["data"]["token"]

            current_user = invitee1
            resp = await client.post("/api/v1/auth/invitations/accept-existing", json={"token": token})
            assert resp.status_code == 200

            current_user = invitee2
            resp = await client.post("/api/v1/auth/invitations/accept-existing", json={"token": token})
            assert resp.status_code == 403


async def test_auth_me_invitations_includes_workspace(prepared_db, integration_valkey_settings) -> None:
    """
    v2: /auth/me/invitations lists email-bound workspace invitations for the current user.
    The listing must include workspace info, otherwise multi-workspace orgs cannot be disambiguated in UI.
    """

    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.security import hash_password
        from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.src.modules.organization.models.user import User
        from apps.api.src.modules.organization.repository import OrganizationRepository
        from apps.api.src.modules.workspaces.invitations.tokens import generate_invite_code
        from apps.api.src.modules.workspaces.models.workspace import Workspace
        from apps.api.src.modules.workspaces.models.workspace_invite import WorkspaceEmailInvite

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")

        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Blog",
            is_active=True,
            created_by_user_id=owner.id,
        )

        invitee = await user_repo.create_user(
            username=f"invitee_{uuid4().hex[:10]}",
            email="invitee@example.com",
            display_name="Invitee",
            password_hash=hash_password("invitee_password_123", settings.auth),
        )

        await WorkspaceEmailInvite.create(
            organization_id=org.id,
            workspace_id=ws.id,
            email=invitee.email,
            role_code="admin",
            code=generate_invite_code(prefix="ei"),
            expires_at=datetime.now(UTC) + timedelta(days=7),
            created_by_user_id=owner.id,
        )

        current_user: User | None = invitee

        async def _get_user():
            assert current_user is not None
            return current_user

        async def _get_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            ws_pid = encode_uuid(ws.id)
            resp = await client.get("/api/v1/auth/me/invitations?status=pending&page=1&size=20")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] >= 1
            item = page["items"][0]
            assert item["email"] == invitee.email
            assert item["workspace"]["id"] == ws_pid
            assert item["workspace"]["name"] == ws.name


async def test_workspace_invite_link_domain_restriction_enforced(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.security import hash_password
        from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.src.modules.organization.models.user import User
        from apps.api.src.modules.organization.repository import OrganizationRepository
        from apps.api.src.modules.workspaces.models.workspace import Workspace

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=owner.id,
        )

        bad = await user_repo.create_user(
            username=f"bad_{uuid4().hex[:10]}",
            email="bad@other.com",
            display_name="Bad",
            password_hash=hash_password("bad_password_123", settings.auth),
        )

        current_user: User | None = None

        async def _get_user():
            assert current_user is not None
            return current_user

        async def _get_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            ws_pid = encode_uuid(ws.id)
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                json={
                    "roleCode": "admin",
                    "expiresInSeconds": 3600,
                    "maxUses": None,
                    "allowedEmailDomain": "example.com",
                },
            )
            assert resp.status_code == 200
            token = resp.json()["data"]["token"]

            current_user = bad
            resp = await client.post("/api/v1/auth/invitations/accept-existing", json={"token": token})
            assert resp.status_code == 403


async def test_a2_single_org_enforced_on_accept_existing(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.security import hash_password
        from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.src.modules.organization.models.user import User
        from apps.api.src.modules.organization.repository import OrganizationRepository
        from apps.api.src.modules.workspaces.models.workspace import Workspace

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org1 = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org1")
        org2 = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org2")

        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org1.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org1.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=owner.id,
        )

        user_in_org2 = await user_repo.create_user(
            username=f"user_{uuid4().hex[:10]}",
            email="user@example.com",
            display_name="User",
            password_hash=hash_password("user_password_123", settings.auth),
        )
        await OrgMembership.create(
            organization_id=org2.id, user_id=user_in_org2.id, role=OrgRole.MEMBER, status="active"
        )

        current_user: User | None = None

        async def _get_user():
            assert current_user is not None
            return current_user

        async def _get_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
            headers={"X-Forwarded-For": uuid4().hex},
        ) as client:
            ws_pid = encode_uuid(ws.id)
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                json={
                    "roleCode": "admin",
                    "expiresInSeconds": 3600,
                    "maxUses": None,
                    "allowedEmailDomain": None,
                },
            )
            assert resp.status_code == 200
            token = resp.json()["data"]["token"]

            current_user = user_in_org2
            resp = await client.post("/api/v1/auth/invitations/accept-existing", json={"token": token})
            assert resp.status_code == 403
