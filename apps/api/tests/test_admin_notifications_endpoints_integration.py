from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.infra.db.orm import verify_db_ready
from apps.api.models.notification import NotificationCategory, NotificationRecord
from apps.api.routers.v1.auth.deps import get_current_user_id

pytestmark = pytest.mark.integration


async def _bootstrap_admin_user(app, *, org_name: str = "Test Org"):
    """
    Create an organization + an admin user with admin:access in that org.

    Returns (org_id, admin_user_id).
    """

    from apps.api.core.organization.repository import OrganizationRepository
    from apps.api.core.rbac.constants import ROLE_ADMIN
    from apps.api.core.rbac.repository import RBACRepository
    from apps.api.routers.v1.auth.repository import UserRepository
    from apps.api.routers.v1.auth.security import hash_password

    settings = get_settings()
    org_repo = OrganizationRepository()
    rbac_repo = RBACRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name=org_name)

    admin = await user_repo.create_user(
        username=f"admin_{uuid4().hex}",
        email=None,
        display_name="Admin",
        password_hash=hash_password("admin_password_123", settings.auth),
    )

    role_admin = await rbac_repo.get_role_by_code(ROLE_ADMIN)
    assert role_admin is not None
    membership = await rbac_repo.ensure_membership(user_id=admin.id, organization_id=org.id)
    await rbac_repo.assign_membership_role(membership_id=membership.id, role=role_admin)

    async def _current_user_id():
        return admin.id

    app.dependency_overrides[get_current_user_id] = _current_user_id
    return org.id, admin.id


async def test_admin_notifications_preview_list_and_read(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        org_id, admin_user_id = await _bootstrap_admin_user(app)
        headers = {"X-Org-Id": str(org_id)}

        # Seed data: 2 unread, 1 read, and 1 unread for another user.
        n1 = await NotificationRecord.create(
            org_id=org_id,
            recipient_user_id=admin_user_id,
            category=NotificationCategory.SECURITY,
            title="Security notice",
            body="Security body",
            target_to="/settings/team/roles",
            target_meta=None,
            actor_user_id=None,
            event_name="security.demo",
            dedupe_key=None,
            read_at=None,
        )
        n2 = await NotificationRecord.create(
            org_id=org_id,
            recipient_user_id=admin_user_id,
            category=NotificationCategory.TEAM,
            title="Team notice",
            body=None,
            target_to="/settings/team/members",
            target_meta=None,
            actor_user_id=None,
            event_name="team.demo",
            dedupe_key=None,
            read_at=None,
        )
        n3 = await NotificationRecord.create(
            org_id=org_id,
            recipient_user_id=admin_user_id,
            category=NotificationCategory.TASK,
            title="Read notice",
            body="Already read",
            target_to="/",
            target_meta=None,
            actor_user_id=None,
            event_name="task.demo",
            dedupe_key=None,
            read_at=datetime.now(tz=UTC),
        )
        other_user_id = uuid4()
        _n4 = await NotificationRecord.create(
            org_id=org_id,
            recipient_user_id=other_user_id,
            category=NotificationCategory.TEAM,
            title="Other user notice",
            body=None,
            target_to="/",
            target_meta=None,
            actor_user_id=None,
            event_name="team.other",
            dedupe_key=None,
            read_at=None,
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/notifications/unread/preview?limit=3", headers=headers)
            assert resp.status_code == 200
            preview = resp.json()["data"]
            assert preview["unreadCount"] == 2
            assert len(preview["items"]) == 2
            assert {item["id"] for item in preview["items"]} == {str(n1.id), str(n2.id)}
            assert all(item.get("readAt") is None for item in preview["items"])

            # list unread only
            resp = await client.get("/api/v1/admin/notifications?status=unread&page=1&size=20", headers=headers)
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] == 2
            assert {item["id"] for item in page["items"]} == {str(n1.id), str(n2.id)}

            # list all should include read ones (but still only for the current user)
            resp = await client.get("/api/v1/admin/notifications?status=all&page=1&size=20", headers=headers)
            assert resp.status_code == 200
            page_all = resp.json()["data"]
            assert page_all["total"] == 3
            assert {item["id"] for item in page_all["items"]} == {str(n1.id), str(n2.id), str(n3.id)}

            # mark read should be idempotent
            resp = await client.post(f"/api/v1/admin/notifications/{n1.id}/read", headers=headers)
            assert resp.status_code == 200
            read1 = resp.json()["data"]
            assert read1["id"] == str(n1.id)
            assert read1["readAt"] is not None

            resp = await client.post(f"/api/v1/admin/notifications/{n1.id}/read", headers=headers)
            assert resp.status_code == 200
            read2 = resp.json()["data"]
            assert read2["id"] == str(n1.id)
            assert read2["readAt"] == read1["readAt"]

            # delete should remove the record entirely (hard delete in MVP)
            resp = await client.delete(f"/api/v1/admin/notifications/{n2.id}", headers=headers)
            assert resp.status_code == 200
            deleted = resp.json()["data"]
            assert deleted["id"] == str(n2.id)

            resp = await client.get("/api/v1/admin/notifications/unread/preview?limit=3", headers=headers)
            assert resp.status_code == 200
            preview2 = resp.json()["data"]
            assert preview2["unreadCount"] == 0
            assert preview2["items"] == []

            resp = await client.get("/api/v1/admin/notifications?status=all&page=1&size=20", headers=headers)
            assert resp.status_code == 200
            page_all2 = resp.json()["data"]
            assert page_all2["total"] == 2

        # DB sanity: only n1 got read_at updated; n2 remains unread; other user's record untouched.
        await n1.refresh_from_db()
        n2_db = await NotificationRecord.get_or_none(id=n2.id)
        await n3.refresh_from_db()
        assert n1.read_at is not None
        assert n2_db is None
        assert n3.read_at is not None


async def test_admin_notifications_mark_all_read(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        org_id, admin_user_id = await _bootstrap_admin_user(app)
        headers = {"X-Org-Id": str(org_id)}

        unread_1 = await NotificationRecord.create(
            org_id=org_id,
            recipient_user_id=admin_user_id,
            category=NotificationCategory.TEAM,
            title="Unread 1",
            body=None,
            target_to="/settings/team/members",
            target_meta=None,
            actor_user_id=None,
            event_name="demo.1",
            dedupe_key=None,
            read_at=None,
        )
        unread_2 = await NotificationRecord.create(
            org_id=org_id,
            recipient_user_id=admin_user_id,
            category=NotificationCategory.SECURITY,
            title="Unread 2",
            body=None,
            target_to="/settings/team/roles",
            target_meta=None,
            actor_user_id=None,
            event_name="demo.2",
            dedupe_key=None,
            read_at=None,
        )
        _read = await NotificationRecord.create(
            org_id=org_id,
            recipient_user_id=admin_user_id,
            category=NotificationCategory.TASK,
            title="Read",
            body=None,
            target_to="/",
            target_meta=None,
            actor_user_id=None,
            event_name="demo.read",
            dedupe_key=None,
            read_at=datetime.now(tz=UTC),
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/admin/notifications/read-all", headers=headers)
            assert resp.status_code == 200
            out = resp.json()["data"]
            assert out["totalCount"] == 2
            assert out["successCount"] == 2

        await unread_1.refresh_from_db()
        await unread_2.refresh_from_db()
        assert unread_1.read_at is not None
        assert unread_2.read_at is not None


async def test_invite_accept_creates_notification_for_inviter(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        org_id, admin_user_id = await _bootstrap_admin_user(app)
        headers = {"X-Org-Id": str(org_id)}

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Admin creates an invitation.
            invite_email = f"{uuid4().hex}@example.com"
            resp = await client.post(
                "/api/v1/admin/team/invitations",
                headers=headers,
                json={"email": invite_email, "roleCode": "admin", "expiresInSeconds": 3600},
            )
            assert resp.status_code == 200
            created = resp.json()["data"]
            token = created["token"]

            # Invitee accepts.
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

            # Inviter should see an unread notification pointing to team members list.
            resp = await client.get("/api/v1/admin/notifications/unread/preview?limit=3", headers=headers)
            assert resp.status_code == 200
            preview = resp.json()["data"]
            assert preview["unreadCount"] == 1
            assert len(preview["items"]) == 1
            item = preview["items"][0]
            assert item["recipientUserId"] == str(admin_user_id)
            assert item["targetTo"] == "/settings/team/members"
            assert item.get("eventName") == "team.invitation.accepted"
