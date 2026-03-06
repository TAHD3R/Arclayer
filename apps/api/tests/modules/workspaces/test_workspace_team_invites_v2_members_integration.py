from __future__ import annotations

import asyncio
from typing import Protocol, cast
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.modules.auth.http.service import get_current_user, get_current_user_id

pytestmark = pytest.mark.integration


class _CredentialWithHash(Protocol):
    password_hash: str


class _UserWithCredential(Protocol):
    credential: _CredentialWithHash | None
    token_version: int | None


async def _wait_latest_workspace_audit_event(
    *,
    event_name: str,
    workspace_id: UUID,
    timeout_seconds: float = 3.0,
):
    from apps.api.src.models.analytics.audit_event import AuditEvent

    deadline = asyncio.get_running_loop().time() + timeout_seconds
    while True:
        row = (
            await AuditEvent
            .filter(event_name=event_name, workspace_id=workspace_id)
            .order_by("-occurred_at", "-id")
            .first()
        )
        if row is not None:
            return row
        if asyncio.get_running_loop().time() >= deadline:
            raise AssertionError(f"expected audit event not found: {event_name}")
        await asyncio.sleep(0.1)


async def _enable_mail_service() -> None:
    """
    Enable email sending via system-scoped core settings.

    Notes:
    - Workspace email invites are designed to be delivered by email; the API fails fast when mail is disabled.
    - Tests should enable mail explicitly to avoid coupling to default bootstrap values.
    """

    from apps.api.src.models.system.setting import SettingRecord
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

        monkeypatch.setattr("apps.api.src.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

        from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
        from apps.api.src.models.organization.user import User
        from apps.api.src.models.system.notification import NotificationRecord
        from apps.api.src.models.workspaces.workspace import Workspace
        from apps.api.src.models.workspaces.workspace_invite import WorkspaceEmailInvite
        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.tokens.service import hash_password
        from apps.api.src.modules.organization.repository import OrganizationRepository

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
            ws_pid = encode_uuid(ws.id)
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                json={"email": invite_email, "roleCode": "admin", "expiresInSeconds": 3600},
            )
            assert resp.status_code == 200
            token1 = resp.json()["data"]["token"]
            assert (
                await NotificationRecord.filter(
                    workspace_id=ws.id,
                    recipient_user_id=invitee.id,
                    event_name="workspace.invite.email.created",
                ).count()
                == 1
            )

            # Q2: create again should update existing (still one active invite).
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                json={"email": invite_email, "roleCode": "admin", "expiresInSeconds": 7200},
            )
            assert resp.status_code == 200
            token2 = resp.json()["data"]["token"]
            assert token1 == token2  # code is stable when updating
            assert (
                await NotificationRecord.filter(
                    workspace_id=ws.id,
                    recipient_user_id=invitee.id,
                    event_name="workspace.invite.email.updated",
                ).count()
                == 1
            )

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
            resp = await client.get(f"/api/v1/workspaces/{ws_pid}/team/email-invites?status=accepted&page=1&size=10")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] >= 1

            ordered_email_low = f"aa_{uuid4().hex[:6]}@ordering.workspace.example.com"
            ordered_email_high = f"zz_{uuid4().hex[:6]}@ordering.workspace.example.com"
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                json={"email": ordered_email_low, "roleCode": "admin", "expiresInSeconds": 3600},
            )
            assert resp.status_code == 200
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                json={"email": ordered_email_high, "roleCode": "admin", "expiresInSeconds": 3600},
            )
            assert resp.status_code == 200

            resp = await client.get(
                f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                params={"q": "ordering.workspace.example.com", "ordering": "email", "page": 1, "size": 10},
            )
            assert resp.status_code == 200
            ordered_invites_asc_items = resp.json()["data"]["items"]
            assert ordered_invites_asc_items[0]["email"] == ordered_email_low

            resp = await client.get(
                f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                params={"q": "ordering.workspace.example.com", "ordering": "-email", "page": 1, "size": 10},
            )
            assert resp.status_code == 200
            ordered_invites_desc_items = resp.json()["data"]["items"]
            assert ordered_invites_desc_items[0]["email"] == ordered_email_high


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

        monkeypatch.setattr("apps.api.src.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

        from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
        from apps.api.src.models.organization.user import User
        from apps.api.src.models.workspaces.workspace import Workspace
        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.tokens.service import hash_password
        from apps.api.src.modules.organization.repository import OrganizationRepository

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
            ws_pid = encode_uuid(ws.id)
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/email-invites",
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

        from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
        from apps.api.src.models.organization.user import User
        from apps.api.src.models.workspaces.workspace import Workspace
        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.tokens.service import hash_password
        from apps.api.src.modules.organization.repository import OrganizationRepository

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
            ws_pid = encode_uuid(ws.id)
            current_user = owner
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                json={"roleCode": "admin", "expiresInSeconds": 3600, "maxUses": None, "allowedEmailDomain": None},
            )
            assert resp.status_code == 200
            token = resp.json()["data"]["token"]
            link_id = resp.json()["data"]["link"]["id"]

            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                json={"roleCode": "admin", "expiresInSeconds": 3600, "maxUses": None, "allowedEmailDomain": None},
            )
            assert resp.status_code == 200
            latest_link_id = resp.json()["data"]["link"]["id"]

            resp = await client.get(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                params={"ordering": "-created_at", "page": 1, "size": 10},
            )
            assert resp.status_code == 200
            ordered_links_items = resp.json()["data"]["items"]
            assert ordered_links_items[0]["id"] == latest_link_id

            # Disable the link.
            resp = await client.post(f"/api/v1/workspaces/{ws_pid}/team/invite-links/{link_id}/disable")
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

        from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
        from apps.api.src.models.organization.user import User
        from apps.api.src.models.system.notification import NotificationRecord
        from apps.api.src.models.workspaces.workspace import Workspace, WorkspaceMembership
        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.tokens.service import hash_password
        from apps.api.src.modules.organization.repository import OrganizationRepository

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

        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        await OrgMembership.create(organization_id=org.id, user_id=member.id, role=OrgRole.MEMBER, status="active")
        await OrgMembership.create(organization_id=org.id, user_id=other.id, role=OrgRole.MEMBER, status="active")

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
            ws_pid = encode_uuid(ws.id)
            member_m_pid = encode_uuid(member_m.id)
            owner_m_pid = encode_uuid(owner_m.id)

            # Owner updates member profile (workspace-scoped).
            current_user = owner
            resp = await client.patch(
                f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}",
                json={"displayName": "Member Renamed", "email": "member2@example.com"},
            )
            assert resp.status_code == 200
            out = resp.json()["data"]
            assert out["membershipId"] == member_m_pid
            assert out["displayName"] == "Member Renamed"
            assert out["email"] == "member2@example.com"
            profile_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.member.profile.updated",
                workspace_id=ws.id,
            )
            assert profile_event.organization_id == org.id
            assert profile_event.actor_user_id == owner.id
            assert profile_event.subject_user_id == member.id
            assert profile_event.entity_type == "workspace_membership"
            assert profile_event.entity_id == member_m.id
            assert isinstance(profile_event.properties, dict)
            changed_fields = profile_event.properties.get("changed_fields")
            assert isinstance(changed_fields, list)
            assert "display_name" in changed_fields
            assert "email" in changed_fields

            # Email conflict should be rejected.
            resp = await client.patch(
                f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}",
                json={"email": "other@example.com"},
            )
            assert resp.status_code == 409

            # Disable member.
            resp = await client.post(f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}/disable")
            assert resp.status_code == 200
            assert resp.json()["data"]["membershipId"] == member_m_pid
            assert resp.json()["data"]["status"] == "disabled"

            # Enable member.
            resp = await client.post(f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}/enable")
            assert resp.status_code == 200
            assert resp.json()["data"]["status"] == "active"
            assert (
                await NotificationRecord.filter(
                    workspace_id=ws.id,
                    recipient_user_id=member.id,
                    event_name="workspace.member.status.updated",
                ).count()
                == 2
            )

            # Update member roles.
            resp = await client.put(
                f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}/roles",
                json={"roleCodes": ["admin"]},
            )
            assert resp.status_code == 200
            assert (
                await NotificationRecord.filter(
                    workspace_id=ws.id,
                    recipient_user_id=member.id,
                    event_name="workspace.member.roles.updated",
                ).count()
                == 1
            )

            # Reset password should update credential and bump token_version.
            before = await user_repo.get_by_id_with_credential(member.id)
            assert before is not None
            before_like = cast(_UserWithCredential, before)
            before_hash = before_like.credential.password_hash if before_like.credential else None
            before_ver = int(before_like.token_version or 0)

            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}/reset-password",
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
            assert (
                await NotificationRecord.filter(
                    workspace_id=ws.id,
                    recipient_user_id=member.id,
                    event_name="workspace.member.password.reset",
                ).count()
                == 1
            )
            pwd_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.member.password.reset",
                workspace_id=ws.id,
            )
            assert pwd_event.organization_id == org.id
            assert pwd_event.actor_user_id == owner.id
            assert pwd_event.subject_user_id == member.id
            assert pwd_event.entity_type == "workspace_membership"
            assert pwd_event.entity_id == member_m.id

            # Disabling self should be rejected.
            resp = await client.post(f"/api/v1/workspaces/{ws_pid}/team/members/{owner_m_pid}/disable")
            assert resp.status_code == 400
