from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol, cast
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.infra.db.orm import verify_db_ready
from apps.api.routers.v1.auth.deps import get_current_user, get_current_user_id

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

    from apps.api.models.setting import SettingRecord
    from apps.api.settings.core_schema import CORE_SETTINGS_NAMESPACE
    from apps.api.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

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

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

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

        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")
        await OrgMembership.create(organization_id=org.id, user_id=other.id, is_owner=False, status="active")

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
            assert ids == {str(ws1.id), str(ws2.id)}

            by_id = {i["workspaceId"]: i for i in items}
            assert by_id[str(ws1.id)]["isCreatorAdmin"] is True
            assert by_id[str(ws1.id)]["visibleOnly"] is False
            assert by_id[str(ws2.id)]["isCreatorAdmin"] is False
            assert by_id[str(ws2.id)]["visibleOnly"] is True


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

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.rbac import Role
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace
        from apps.api.models.workspace_invite import WorkspaceInviteLinkUseEvent
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

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
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")

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
            # 1) Owner creates a reusable invite link with domain restriction.
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/team/invite-links",
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
            assert data["organizationId"] == str(org.id)
            assert data["workspaceId"] == str(ws.id)

            # 3) Link use event should be created.
            assert await WorkspaceInviteLinkUseEvent.filter(used_by_user_id=invitee.id).exists()

            # 4) Owner can list links and see participants.
            current_user = owner
            resp = await client.get(f"/api/v1/workspaces/{ws.id}/team/invite-links?page=1&size=10")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] >= 1
            link = page["items"][0]
            assert link["usesCount"] >= 1
            assert any(p["user"]["userId"] == str(invitee.id) for p in (link.get("recentParticipants") or []))

            # 5) Participants endpoint should paginate full usage events.
            resp = await client.get(
                f"/api/v1/workspaces/{ws.id}/team/invite-links/{link['id']}/participants?page=1&size=10"
            )
            assert resp.status_code == 200
            participants = resp.json()["data"]
            assert participants["total"] >= 1
            assert any(p["user"]["userId"] == str(invitee.id) for p in participants["items"])


async def test_workspace_invite_link_max_uses_enforced(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")
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
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/team/invite-links",
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

        from apps.api.core.invitations.tokens import generate_invite_code
        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace
        from apps.api.models.workspace_invite import WorkspaceEmailInvite
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")

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
            resp = await client.get("/api/v1/auth/me/invitations?status=pending&page=1&size=20")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] >= 1
            item = page["items"][0]
            assert item["email"] == invitee.email
            assert item["workspace"]["id"] == str(ws.id)
            assert item["workspace"]["name"] == ws.name


async def test_workspace_invite_link_domain_restriction_enforced(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")
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
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/team/invite-links",
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

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

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
        await OrgMembership.create(organization_id=org1.id, user_id=owner.id, is_owner=True, status="active")
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
        await OrgMembership.create(organization_id=org2.id, user_id=user_in_org2.id, is_owner=False, status="active")

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
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/team/invite-links",
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


async def test_workspace_email_invite_pending_unique_and_accept(
    prepared_db, integration_valkey_settings, monkeypatch
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        await _enable_mail_service()

        class DummyMail:
            async def send_message(self, _message, **_kwargs):  # type: ignore[no-untyped-def]
                return None

        async def _dummy_get_fast_mail(self):  # type: ignore[no-untyped-def]
            return DummyMail()

        monkeypatch.setattr("apps.api.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace
        from apps.api.models.workspace_invite import WorkspaceEmailInvite
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=owner.id,
        )

        invite_email = "invited@example.com"
        invitee = await user_repo.create_user(
            username=f"invitee_{uuid4().hex[:10]}",
            email=invite_email,
            display_name="Invitee",
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
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/team/email-invites",
                json={"email": invite_email, "roleCode": "admin", "expiresInSeconds": 3600},
            )
            assert resp.status_code == 200
            token1 = resp.json()["data"]["token"]

            # Q2: create again should update existing (still one active invite).
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/team/email-invites",
                json={"email": invite_email, "roleCode": "admin", "expiresInSeconds": 7200},
            )
            assert resp.status_code == 200
            token2 = resp.json()["data"]["token"]
            assert token1 == token2  # code is stable when updating

            assert (
                await WorkspaceEmailInvite.filter(
                    workspace_id=ws.id, email=invite_email, revoked_at=None, accepted_at=None
                ).count()
                == 1
            )

            # Accept existing with matching email.
            current_user = invitee
            resp = await client.post("/api/v1/auth/invitations/accept-existing", json={"token": token1})
            assert resp.status_code == 200

            # Accepted list should include it.
            current_user = owner
            resp = await client.get(f"/api/v1/workspaces/{ws.id}/team/email-invites?status=accepted&page=1&size=10")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] >= 1


async def test_workspace_email_invite_email_mismatch_rejected(
    prepared_db, integration_valkey_settings, monkeypatch
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        await _enable_mail_service()

        class DummyMail:
            async def send_message(self, _message, **_kwargs):  # type: ignore[no-untyped-def]
                return None

        async def _dummy_get_fast_mail(self):  # type: ignore[no-untyped-def]
            return DummyMail()

        monkeypatch.setattr("apps.api.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=owner.id,
        )

        # This user does NOT match the invited email.
        bad = await user_repo.create_user(
            username=f"bad_{uuid4().hex[:10]}",
            email="bad@example.com",
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
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/team/email-invites",
                json={"email": "invited@example.com", "roleCode": "admin", "expiresInSeconds": 3600},
            )
            assert resp.status_code == 200
            token = resp.json()["data"]["token"]

            current_user = bad
            resp = await client.post("/api/v1/auth/invitations/accept-existing", json={"token": token})
            assert resp.status_code == 403


async def test_workspace_invite_link_disable_blocks_accept(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=owner.id,
        )

        invitee = await user_repo.create_user(
            username=f"invitee_{uuid4().hex[:10]}",
            email="invitee@example.com",
            display_name="Invitee",
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
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/team/invite-links",
                json={"roleCode": "admin", "expiresInSeconds": 3600, "maxUses": None, "allowedEmailDomain": None},
            )
            assert resp.status_code == 200
            token = resp.json()["data"]["token"]
            link_id = resp.json()["data"]["link"]["id"]

            # Disable the link.
            resp = await client.post(f"/api/v1/workspaces/{ws.id}/team/invite-links/{link_id}/disable")
            assert resp.status_code == 200

            # Accept should fail.
            current_user = invitee
            resp = await client.post("/api/v1/auth/invitations/accept-existing", json={"token": token})
            assert resp.status_code == 403


async def test_workspace_team_member_manage_update_disable_enable_and_reset_password(
    prepared_db, integration_valkey_settings
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from apps.api.core.organization.repository import OrganizationRepository
        from apps.api.models.org_membership import OrgMembership
        from apps.api.models.user import User
        from apps.api.models.workspace import Workspace, WorkspaceMembership
        from apps.api.routers.v1.auth.repository import UserRepository
        from apps.api.routers.v1.auth.security import hash_password

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")

        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        member = await user_repo.create_user(
            username=f"member_{uuid4().hex[:10]}",
            email="member@example.com",
            display_name="Member",
            password_hash=hash_password("member_password_123", settings.auth),
        )
        other = await user_repo.create_user(
            username=f"other_{uuid4().hex[:10]}",
            email="other@example.com",
            display_name="Other",
            password_hash=hash_password("other_password_123", settings.auth),
        )

        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")
        await OrgMembership.create(organization_id=org.id, user_id=member.id, is_owner=False, status="active")
        await OrgMembership.create(organization_id=org.id, user_id=other.id, is_owner=False, status="active")

        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=owner.id,
        )

        owner_m = await WorkspaceMembership.create(
            workspace_id=ws.id, user_id=owner.id, status="active", invited_by_user_id=None
        )
        member_m = await WorkspaceMembership.create(
            workspace_id=ws.id, user_id=member.id, status="active", invited_by_user_id=owner.id
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
            # Owner updates member profile (workspace-scoped).
            current_user = owner
            resp = await client.patch(
                f"/api/v1/workspaces/{ws.id}/team/members/{member_m.id}",
                json={"displayName": "Member Renamed", "email": "member2@example.com"},
            )
            assert resp.status_code == 200
            out = resp.json()["data"]
            assert out["membershipId"] == str(member_m.id)
            assert out["displayName"] == "Member Renamed"
            assert out["email"] == "member2@example.com"

            # Email conflict should be rejected.
            resp = await client.patch(
                f"/api/v1/workspaces/{ws.id}/team/members/{member_m.id}",
                json={"email": "other@example.com"},
            )
            assert resp.status_code == 409

            # Disable member.
            resp = await client.post(f"/api/v1/workspaces/{ws.id}/team/members/{member_m.id}/disable")
            assert resp.status_code == 200
            assert resp.json()["data"]["membershipId"] == str(member_m.id)
            assert resp.json()["data"]["status"] == "disabled"

            # Enable member.
            resp = await client.post(f"/api/v1/workspaces/{ws.id}/team/members/{member_m.id}/enable")
            assert resp.status_code == 200
            assert resp.json()["data"]["status"] == "active"

            # Reset password should update credential and bump token_version.
            before = await user_repo.get_by_id_with_credential(member.id)
            assert before is not None
            before_like = cast(_UserWithCredential, before)
            before_hash = before_like.credential.password_hash if before_like.credential else None
            before_ver = int(before_like.token_version or 0)

            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/team/members/{member_m.id}/reset-password",
                json={"newPassword": "new_password_1234"},
            )
            assert resp.status_code == 200

            after = await user_repo.get_by_id_with_credential(member.id)
            assert after is not None
            after_like = cast(_UserWithCredential, after)
            after_hash = after_like.credential.password_hash if after_like.credential else None
            assert after_hash is not None
            assert after_hash != before_hash
            assert int(after_like.token_version or 0) == before_ver + 1

            # Disabling self should be rejected.
            resp = await client.post(f"/api/v1/workspaces/{ws.id}/team/members/{owner_m.id}/disable")
            assert resp.status_code == 400
