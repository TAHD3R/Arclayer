from __future__ import annotations

import asyncio
from typing import Protocol, cast
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.modules.auth.http.service import get_current_user, get_current_user_id

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
    from src.models.analytics.audit_event import AuditEvent

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

    from src.models.system.setting import SettingRecord
    from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
    from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

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

        monkeypatch.setattr("src.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

        from src.models.analytics.audit_event import AuditEvent
        from src.models.organization.org_membership import OrgMembership, OrgRole
        from src.models.organization.user import User
        from src.models.projects.project import ProjectRecord
        from src.models.system.notification import NotificationRecord
        from src.models.workspaces.workspace import Workspace
        from src.models.workspaces.workspace_invite import WorkspaceEmailInvite
        from src.modules.auth.repository import UserRepository
        from src.modules.auth.tokens.service import hash_password
        from src.modules.organization.repository import OrganizationRepository

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
            name="Site",
            is_active=True,
            owner_user_id=owner.id,
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
            invite_row = await WorkspaceEmailInvite.get(workspace_id=ws.id, email=invite_email)
            created_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.invite.email.created",
                workspace_id=ws.id,
            )
            assert created_event.organization_id == org.id
            assert created_event.workspace_id == ws.id
            assert created_event.actor_user_id == owner.id
            assert isinstance(created_event.properties, dict)
            assert created_event.properties.get("invite_id") == str(invite_row.id)

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
            updated_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.invite.email.updated",
                workspace_id=ws.id,
            )
            assert updated_event.organization_id == org.id
            assert updated_event.workspace_id == ws.id
            assert updated_event.actor_user_id == owner.id
            assert isinstance(updated_event.properties, dict)
            assert updated_event.properties.get("invite_id") == str(invite_row.id)

            assert (
                await WorkspaceEmailInvite.filter(
                    workspace_id=ws.id, email=invite_email, revoked_at=None, accepted_at=None
                ).count()
                == 1
            )

            # Renew and revoke lifecycle should persist operation-level Activity evidence.
            lifecycle_email = f"lifecycle_{uuid4().hex[:8]}@example.com"
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                json={"email": lifecycle_email, "roleCode": "admin", "expiresInSeconds": 3600},
            )
            assert resp.status_code == 200
            lifecycle_invite_id = resp.json()["data"]["invitation"]["id"]
            lifecycle_token = resp.json()["data"]["token"]

            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/email-invites/{lifecycle_invite_id}/renew",
                json={"expiresInSeconds": 7200},
            )
            assert resp.status_code == 200
            renewed_lifecycle_token = resp.json()["data"]["token"]
            assert renewed_lifecycle_token != lifecycle_token
            old_preview = await client.get(
                "/api/v1/auth/invitations/preview",
                params={"token": lifecycle_token},
            )
            assert old_preview.status_code == 404
            renewed_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.invite.email.renewed",
                workspace_id=ws.id,
            )
            assert renewed_event.organization_id == org.id
            assert renewed_event.workspace_id == ws.id
            assert renewed_event.actor_user_id == owner.id

            resp = await client.delete(f"/api/v1/workspaces/{ws_pid}/team/email-invites/{lifecycle_invite_id}")
            assert resp.status_code == 200
            revoked_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.invite.email.revoked",
                workspace_id=ws.id,
            )
            assert revoked_event.organization_id == org.id
            assert revoked_event.workspace_id == ws.id
            assert revoked_event.actor_user_id == owner.id

            activity_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/activity?eventName=workspace.invite.&page=1&size=10"
            )
            assert activity_res.status_code == 200, activity_res.text
            activity_items = activity_res.json()["data"]["items"]
            invite_event_names = [
                entry["eventName"] for entry in activity_items if entry["eventName"].startswith("workspace.invite.")
            ]
            assert set(invite_event_names[:4]) == {
                "workspace.invite.email.revoked",
                "workspace.invite.email.renewed",
                "workspace.invite.email.updated",
                "workspace.invite.email.created",
            }
            invite_created_entry = next(
                entry
                for entry in activity_items
                if entry["eventName"] == "workspace.invite.email.created"
                and entry["properties"]["invite_id"] == str(invite_row.id)
            )
            assert invite_created_entry["properties"]["invite_id"] == str(invite_row.id)
            assert "invited@example.com" not in str(invite_created_entry["properties"])

            # Accept existing with matching email.
            current_user = invitee
            resp = await client.post("/api/v1/auth/invitations/accept-existing", json={"token": token1})
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["projectId"] is None
            assert await ProjectRecord.filter(workspace_id=ws.id).count() == 0
            organization_membership = await OrgMembership.get(
                organization_id=org.id,
                user_id=invitee.id,
            )
            assert organization_membership.role == OrgRole.MEMBER
            assert organization_membership.role_code == OrgRole.MEMBER.value

            accepted_invite = await WorkspaceEmailInvite.get(id=invite_row.id)
            first_accepted_at = accepted_invite.accepted_at
            first_audit_count = await AuditEvent.filter(
                event_name="workspace.invite.accepted",
                workspace_id=ws.id,
                actor_user_id=invitee.id,
            ).count()
            first_notification_count = await NotificationRecord.filter(
                workspace_id=ws.id,
                recipient_user_id=owner.id,
                event_name="workspace.invitation.accepted",
            ).count()

            repeated = await client.post(
                "/api/v1/auth/invitations/accept-existing",
                json={"token": token1},
            )
            assert repeated.status_code == 200, repeated.text
            assert repeated.json()["data"] == data
            await accepted_invite.refresh_from_db()
            assert accepted_invite.accepted_at == first_accepted_at
            assert (
                await AuditEvent.filter(
                    event_name="workspace.invite.accepted",
                    workspace_id=ws.id,
                    actor_user_id=invitee.id,
                ).count()
                == first_audit_count
            )
            assert (
                await NotificationRecord.filter(
                    workspace_id=ws.id,
                    recipient_user_id=owner.id,
                    event_name="workspace.invitation.accepted",
                ).count()
                == first_notification_count
            )

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

            # Prepare pending invites used for rollback checks.
            update_fail_email = f"rollback_update_{uuid4().hex[:8]}@example.com"
            renew_fail_email = f"rollback_renew_{uuid4().hex[:8]}@example.com"
            revoke_fail_email = f"rollback_revoke_{uuid4().hex[:8]}@example.com"
            for pending_email in [update_fail_email, renew_fail_email, revoke_fail_email]:
                resp = await client.post(
                    f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                    json={"email": pending_email, "roleCode": "admin", "expiresInSeconds": 3600},
                )
                assert resp.status_code == 200

            from src.modules.workspaces.team import service as team_service_module

            original_write_required_activity_event = team_service_module.write_required_activity_event

            async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
                if payload.event_name in {
                    "workspace.invite.email.created",
                    "workspace.invite.email.updated",
                    "workspace.invite.email.renewed",
                    "workspace.invite.email.revoked",
                }:
                    raise RuntimeError(f"forced activity write failure: {payload.event_name}")
                return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

            monkeypatch.setattr(
                "src.modules.workspaces.team.service.write_required_activity_event",
                _failing_write_required_activity_event,
            )

            created_event_count = await AuditEvent.filter(
                event_name="workspace.invite.email.created",
                workspace_id=ws.id,
            ).count()
            updated_event_count = await AuditEvent.filter(
                event_name="workspace.invite.email.updated",
                workspace_id=ws.id,
            ).count()
            renewed_event_count = await AuditEvent.filter(
                event_name="workspace.invite.email.renewed",
                workspace_id=ws.id,
            ).count()
            revoked_event_count = await AuditEvent.filter(
                event_name="workspace.invite.email.revoked",
                workspace_id=ws.id,
            ).count()

            create_fail_email = f"rollback_create_{uuid4().hex[:8]}@example.com"
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.invite.email.created"):
                await client.post(
                    f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                    json={"email": create_fail_email, "roleCode": "admin", "expiresInSeconds": 3600},
                )
            assert (
                await WorkspaceEmailInvite.filter(
                    workspace_id=ws.id,
                    email=create_fail_email,
                ).count()
                == 0
            )
            assert (
                await AuditEvent.filter(
                    event_name="workspace.invite.email.created",
                    workspace_id=ws.id,
                ).count()
                == created_event_count
            )

            update_fail_invite = await WorkspaceEmailInvite.get(workspace_id=ws.id, email=update_fail_email)
            update_fail_before_expires = update_fail_invite.expires_at
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.invite.email.updated"):
                await client.post(
                    f"/api/v1/workspaces/{ws_pid}/team/email-invites",
                    json={"email": update_fail_email, "roleCode": "admin", "expiresInSeconds": 7200},
                )
            update_fail_after = await WorkspaceEmailInvite.get(id=update_fail_invite.id)
            assert update_fail_after.expires_at == update_fail_before_expires
            assert (
                await AuditEvent.filter(
                    event_name="workspace.invite.email.updated",
                    workspace_id=ws.id,
                ).count()
                == updated_event_count
            )

            renew_fail_invite = await WorkspaceEmailInvite.get(workspace_id=ws.id, email=renew_fail_email)
            renew_fail_before_expires = renew_fail_invite.expires_at
            renew_fail_before_code = renew_fail_invite.code
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.invite.email.renewed"):
                await client.post(
                    f"/api/v1/workspaces/{ws_pid}/team/email-invites/{encode_uuid(renew_fail_invite.id)}/renew",
                    json={"expiresInSeconds": 7200},
                )
            renew_fail_after = await WorkspaceEmailInvite.get(id=renew_fail_invite.id)
            assert renew_fail_after.expires_at == renew_fail_before_expires
            assert renew_fail_after.code == renew_fail_before_code
            assert (
                await AuditEvent.filter(
                    event_name="workspace.invite.email.renewed",
                    workspace_id=ws.id,
                ).count()
                == renewed_event_count
            )

            revoke_fail_invite = await WorkspaceEmailInvite.get(workspace_id=ws.id, email=revoke_fail_email)
            assert revoke_fail_invite.revoked_at is None
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.invite.email.revoked"):
                await client.delete(
                    f"/api/v1/workspaces/{ws_pid}/team/email-invites/{encode_uuid(revoke_fail_invite.id)}"
                )
            revoke_fail_after = await WorkspaceEmailInvite.get(id=revoke_fail_invite.id)
            assert revoke_fail_after.revoked_at is None
            assert revoke_fail_after.revoked_by_user_id is None
            assert (
                await AuditEvent.filter(
                    event_name="workspace.invite.email.revoked",
                    workspace_id=ws.id,
                ).count()
                == revoked_event_count
            )


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

        monkeypatch.setattr("src.common.email.service.EmailService._get_fast_mail", _dummy_get_fast_mail)

        from src.models.organization.org_membership import OrgMembership, OrgRole
        from src.models.organization.user import User
        from src.models.workspaces.workspace import Workspace
        from src.modules.auth.repository import UserRepository
        from src.modules.auth.tokens.service import hash_password
        from src.modules.organization.repository import OrganizationRepository

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
            name="Site",
            is_active=True,
            owner_user_id=owner.id,
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


async def test_workspace_invite_link_disable_blocks_accept(
    prepared_db, integration_valkey_settings, monkeypatch
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from src.models.analytics.audit_event import AuditEvent
        from src.models.organization.org_membership import OrgMembership, OrgRole
        from src.models.organization.user import User
        from src.models.workspaces.workspace import Workspace
        from src.models.workspaces.workspace_invite import WorkspaceInviteLink
        from src.modules.auth.repository import UserRepository
        from src.modules.auth.tokens.service import hash_password
        from src.modules.organization.repository import OrganizationRepository

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
            name="Site",
            is_active=True,
            owner_user_id=owner.id,
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
            created_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.invite.link.created",
                workspace_id=ws.id,
            )
            assert created_event.organization_id == org.id
            assert created_event.workspace_id == ws.id
            assert created_event.actor_user_id == owner.id

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
            assert all("token" not in item and "inviteUrl" not in item for item in ordered_links_items)

            # Renew should write operation-level Activity in the same mutation family.
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links/{link_id}/renew",
                json={"expiresInSeconds": 7200},
            )
            assert resp.status_code == 200
            renewed_token = resp.json()["data"]["token"]
            assert renewed_token != token
            old_preview = await client.get(
                "/api/v1/auth/invitations/preview",
                params={"token": token},
            )
            assert old_preview.status_code == 404
            renewed_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.invite.link.renewed",
                workspace_id=ws.id,
            )
            assert renewed_event.organization_id == org.id
            assert renewed_event.workspace_id == ws.id
            assert renewed_event.actor_user_id == owner.id

            # Disable the link.
            resp = await client.post(f"/api/v1/workspaces/{ws_pid}/team/invite-links/{link_id}/disable")
            assert resp.status_code == 200
            disabled_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.invite.link.disabled",
                workspace_id=ws.id,
            )
            assert disabled_event.organization_id == org.id
            assert disabled_event.workspace_id == ws.id
            assert disabled_event.actor_user_id == owner.id

            active_links = await client.get(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                params={"status": "active", "role_code": "admin", "page": 1, "size": 10},
            )
            assert active_links.status_code == 200, active_links.text
            active_link_ids = {item["id"] for item in active_links.json()["data"]["items"]}
            assert link_id not in active_link_ids
            assert latest_link_id in active_link_ids

            disabled_links = await client.get(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                params={"status": "disabled", "role_code": "admin", "page": 1, "size": 10},
            )
            assert disabled_links.status_code == 200, disabled_links.text
            assert link_id in {item["id"] for item in disabled_links.json()["data"]["items"]}

            # Accept should fail.
            current_user = invitee
            resp = await client.post(
                "/api/v1/auth/invitations/accept-existing",
                json={"token": renewed_token},
            )
            assert resp.status_code == 403

            current_user = owner
            disable_fail_resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                json={"roleCode": "admin", "expiresInSeconds": 3600, "maxUses": None, "allowedEmailDomain": None},
            )
            assert disable_fail_resp.status_code == 200
            disable_fail_link_id = disable_fail_resp.json()["data"]["link"]["id"]

            from src.modules.workspaces.team import service as team_service_module

            original_write_required_activity_event = team_service_module.write_required_activity_event

            async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
                if payload.event_name in {
                    "workspace.invite.link.created",
                    "workspace.invite.link.renewed",
                    "workspace.invite.link.disabled",
                }:
                    raise RuntimeError(f"forced activity write failure: {payload.event_name}")
                return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

            monkeypatch.setattr(
                "src.modules.workspaces.team.service.write_required_activity_event",
                _failing_write_required_activity_event,
            )

            created_event_count = await AuditEvent.filter(
                event_name="workspace.invite.link.created",
                workspace_id=ws.id,
            ).count()
            renewed_event_count = await AuditEvent.filter(
                event_name="workspace.invite.link.renewed",
                workspace_id=ws.id,
            ).count()
            disabled_event_count = await AuditEvent.filter(
                event_name="workspace.invite.link.disabled",
                workspace_id=ws.id,
            ).count()

            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.invite.link.created"):
                await client.post(
                    f"/api/v1/workspaces/{ws_pid}/team/invite-links",
                    json={"roleCode": "admin", "expiresInSeconds": 3600, "maxUses": None, "allowedEmailDomain": None},
                )
            assert (
                await WorkspaceInviteLink.filter(
                    workspace_id=ws.id,
                    created_by_user_id=owner.id,
                ).count()
                == 3
            )
            assert (
                await AuditEvent.filter(
                    event_name="workspace.invite.link.created",
                    workspace_id=ws.id,
                ).count()
                == created_event_count
            )

            renew_fail_link = await WorkspaceInviteLink.get(id=decode_public_id(link_id))
            renew_fail_before_expires = renew_fail_link.expires_at
            renew_fail_before_code = renew_fail_link.code
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.invite.link.renewed"):
                await client.post(
                    f"/api/v1/workspaces/{ws_pid}/team/invite-links/{link_id}/renew",
                    json={"expiresInSeconds": 10800},
                )
            renew_fail_after = await WorkspaceInviteLink.get(id=renew_fail_link.id)
            assert renew_fail_after.expires_at == renew_fail_before_expires
            assert renew_fail_after.code == renew_fail_before_code
            assert (
                await AuditEvent.filter(
                    event_name="workspace.invite.link.renewed",
                    workspace_id=ws.id,
                ).count()
                == renewed_event_count
            )

            disable_fail_link = await WorkspaceInviteLink.get(id=decode_public_id(disable_fail_link_id))
            assert disable_fail_link.disabled_at is None
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.invite.link.disabled"):
                await client.post(f"/api/v1/workspaces/{ws_pid}/team/invite-links/{disable_fail_link_id}/disable")
            disable_fail_after = await WorkspaceInviteLink.get(id=disable_fail_link.id)
            assert disable_fail_after.disabled_at is None
            assert (
                await AuditEvent.filter(
                    event_name="workspace.invite.link.disabled",
                    workspace_id=ws.id,
                ).count()
                == disabled_event_count
            )


async def test_workspace_team_member_manage_update_disable_enable_and_reset_password(
    prepared_db, integration_valkey_settings, monkeypatch
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        from src.models.analytics.audit_event import AuditEvent
        from src.models.organization.org_membership import OrgMembership, OrgRole
        from src.models.organization.user import User
        from src.models.system.notification import NotificationRecord
        from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipRole
        from src.modules.auth.repository import UserRepository
        from src.modules.auth.tokens.service import hash_password
        from src.modules.organization.repository import OrganizationRepository

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
            name="Site",
            is_active=True,
            owner_user_id=owner.id,
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

            current_user = owner
            resp = await client.get(f"/api/v1/workspaces/{ws_pid}/team/members?page=1&size=10")
            assert resp.status_code == 200, resp.text
            members_by_id = {item["membershipId"]: item for item in resp.json()["data"]["items"]}
            assert members_by_id[owner_m_pid]["isOwner"] is True
            assert members_by_id[member_m_pid]["isOwner"] is False

            resp = await client.put(
                f"/api/v1/workspaces/{ws_pid}/team/members/{owner_m_pid}/roles",
                json={"roleCodes": ["admin"]},
            )
            assert resp.status_code == 400, resp.text
            assert resp.json()["error"] == "WORKSPACE_OWNER_MEMBERSHIP_IMMUTABLE"
            assert await WorkspaceMembershipRole.filter(membership_id=owner_m.id).count() == 0

            # Owner updates member profile (workspace-scoped).
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
            disabled_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.member.status.updated",
                workspace_id=ws.id,
            )
            assert disabled_event.organization_id == org.id
            assert disabled_event.actor_user_id == owner.id
            assert disabled_event.subject_user_id == member.id
            assert disabled_event.entity_type == "workspace_membership"
            assert disabled_event.entity_id == member_m.id
            assert isinstance(disabled_event.properties, dict)
            assert disabled_event.properties.get("enabled") is False

            # Enable member.
            resp = await client.post(f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}/enable")
            assert resp.status_code == 200
            assert resp.json()["data"]["status"] == "active"
            enabled_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.member.status.updated",
                workspace_id=ws.id,
            )
            assert enabled_event.organization_id == org.id
            assert enabled_event.actor_user_id == owner.id
            assert enabled_event.subject_user_id == member.id
            assert enabled_event.entity_type == "workspace_membership"
            assert enabled_event.entity_id == member_m.id
            assert isinstance(enabled_event.properties, dict)
            assert enabled_event.properties.get("enabled") is True
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
            roles_event = await _wait_latest_workspace_audit_event(
                event_name="workspace.member.roles.updated",
                workspace_id=ws.id,
            )
            assert roles_event.organization_id == org.id
            assert roles_event.actor_user_id == owner.id
            assert roles_event.subject_user_id == member.id
            assert roles_event.entity_type == "workspace_membership"
            assert roles_event.entity_id == member_m.id
            assert isinstance(roles_event.properties, dict)
            role_codes_after = roles_event.properties.get("role_codes_after")
            assert isinstance(role_codes_after, list)
            assert "admin" in role_codes_after
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

            activity_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/activity?eventName=workspace.member.&page=1&size=10"
            )
            assert activity_res.status_code == 200, activity_res.text
            activity_items = activity_res.json()["data"]["items"]
            member_event_names = [
                entry["eventName"] for entry in activity_items if entry["eventName"].startswith("workspace.member.")
            ]
            assert member_event_names[:5] == [
                "workspace.member.password.reset",
                "workspace.member.roles.updated",
                "workspace.member.status.updated",
                "workspace.member.status.updated",
                "workspace.member.profile.updated",
            ]
            password_event = next(
                entry for entry in activity_items if entry["eventName"] == "workspace.member.password.reset"
            )
            assert password_event["properties"]["membership_id"] == str(member_m.id)
            assert "new_password" not in password_event["properties"]
            assert "password" not in password_event["properties"]

            # Disabling self should be rejected.
            resp = await client.post(f"/api/v1/workspaces/{ws_pid}/team/members/{owner_m_pid}/disable")
            assert resp.status_code == 400
            assert resp.json()["error"] == "WORKSPACE_OWNER_MEMBERSHIP_IMMUTABLE"

            from src.modules.workspaces.team import service as team_service_module

            original_write_required_activity_event = team_service_module.write_required_activity_event

            async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
                if payload.event_name in {
                    "workspace.member.profile.updated",
                    "workspace.member.status.updated",
                    "workspace.member.roles.updated",
                    "workspace.member.password.reset",
                }:
                    raise RuntimeError(f"forced activity write failure: {payload.event_name}")
                return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

            monkeypatch.setattr(
                "src.modules.workspaces.team.service.write_required_activity_event",
                _failing_write_required_activity_event,
            )

            profile_event_count = await AuditEvent.filter(
                event_name="workspace.member.profile.updated",
                workspace_id=ws.id,
            ).count()
            status_event_count = await AuditEvent.filter(
                event_name="workspace.member.status.updated",
                workspace_id=ws.id,
            ).count()
            roles_event_count = await AuditEvent.filter(
                event_name="workspace.member.roles.updated",
                workspace_id=ws.id,
            ).count()
            password_event_count = await AuditEvent.filter(
                event_name="workspace.member.password.reset",
                workspace_id=ws.id,
            ).count()

            before_profile_user = await user_repo.get_by_id(member.id)
            assert before_profile_user is not None
            before_profile_display_name = before_profile_user.display_name
            before_profile_email = before_profile_user.email

            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.member.profile.updated"):
                await client.patch(
                    f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}",
                    json={"displayName": "Should Rollback", "email": "rollback.member@example.com"},
                )

            after_profile_user = await user_repo.get_by_id(member.id)
            assert after_profile_user is not None
            assert after_profile_user.display_name == before_profile_display_name
            assert after_profile_user.email == before_profile_email
            assert (
                await AuditEvent.filter(
                    event_name="workspace.member.profile.updated",
                    workspace_id=ws.id,
                ).count()
                == profile_event_count
            )

            before_disable_membership = await WorkspaceMembership.get(id=member_m.id)
            assert before_disable_membership.status == "active"
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.member.status.updated"):
                await client.post(f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}/disable")
            after_disable_membership = await WorkspaceMembership.get(id=member_m.id)
            assert after_disable_membership.status == "active"
            assert (
                await AuditEvent.filter(
                    event_name="workspace.member.status.updated",
                    workspace_id=ws.id,
                ).count()
                == status_event_count
            )

            after_disable_membership.status = "disabled"
            await after_disable_membership.save(update_fields=["status", "updated_at"])
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.member.status.updated"):
                await client.post(f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}/enable")
            after_enable_failure_membership = await WorkspaceMembership.get(id=member_m.id)
            assert after_enable_failure_membership.status == "disabled"
            assert (
                await AuditEvent.filter(
                    event_name="workspace.member.status.updated",
                    workspace_id=ws.id,
                ).count()
                == status_event_count
            )
            after_enable_failure_membership.status = "active"
            await after_enable_failure_membership.save(update_fields=["status", "updated_at"])

            before_roles = sorted(
                await WorkspaceMembershipRole.filter(membership_id=member_m.id).values_list("role__code", flat=True)
            )
            assert before_roles == ["admin"]
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.member.roles.updated"):
                await client.put(
                    f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}/roles",
                    json={"roleCodes": ["viewer"]},
                )
            after_roles = sorted(
                await WorkspaceMembershipRole.filter(membership_id=member_m.id).values_list("role__code", flat=True)
            )
            assert after_roles == before_roles
            assert (
                await AuditEvent.filter(
                    event_name="workspace.member.roles.updated",
                    workspace_id=ws.id,
                ).count()
                == roles_event_count
            )

            before_reset = await user_repo.get_by_id_with_credential(member.id)
            assert before_reset is not None
            before_reset_like = cast(_UserWithCredential, before_reset)
            before_reset_hash = before_reset_like.credential.password_hash if before_reset_like.credential else None
            before_reset_ver = int(before_reset_like.token_version or 0)
            with pytest.raises(RuntimeError, match="forced activity write failure: workspace.member.password.reset"):
                await client.post(
                    f"/api/v1/workspaces/{ws_pid}/team/members/{member_m_pid}/reset-password",
                    json={"newPassword": "rollback_password_1234"},
                )
            after_reset = await user_repo.get_by_id_with_credential(member.id)
            assert after_reset is not None
            after_reset_like = cast(_UserWithCredential, after_reset)
            after_reset_hash = after_reset_like.credential.password_hash if after_reset_like.credential else None
            assert after_reset_hash == before_reset_hash
            assert int(after_reset_like.token_version or 0) == before_reset_ver
            assert (
                await AuditEvent.filter(
                    event_name="workspace.member.password.reset",
                    workspace_id=ws.id,
                ).count()
                == password_event_count
            )
