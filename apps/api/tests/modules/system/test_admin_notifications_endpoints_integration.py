from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.database.orm import verify_db_ready
from apps.api.core.registry import create_app
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.system.models.notification import NotificationCategory, NotificationRecord

pytestmark = pytest.mark.integration


async def _bootstrap_admin_user(app, *, org_name: str = "Test Org"):
    """
    Create an organization + an org owner user + a workspace (v2 scope).

    Returns (workspace_id, admin_user_id).
    """

    from apps.api.core.organization.repository import OrganizationRepository
    from apps.api.modules.auth.repository import UserRepository
    from apps.api.modules.auth.security import hash_password
    from apps.api.modules.organization.models.org_membership import OrgMembership
    from apps.api.modules.workspaces.models.workspace import Workspace

    settings = get_settings()
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name=org_name)

    admin = await user_repo.create_user(
        username=f"admin_{uuid4().hex}",
        email=None,
        display_name="Admin",
        password_hash=hash_password("admin_password_123", settings.auth),
    )
    await OrgMembership.create(organization_id=org.id, user_id=admin.id, is_owner=True, status="active")
    ws = await Workspace.create(
        organization_id=org.id,
        slug=f"ws_{uuid4().hex[:8]}",
        name="Site",
        is_active=True,
        created_by_user_id=admin.id,
    )

    async def _current_user_id():
        return admin.id

    app.dependency_overrides[get_current_user_id] = _current_user_id
    return ws.id, admin.id


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

        workspace_id, admin_user_id = await _bootstrap_admin_user(app)

        # Seed data: 2 unread, 1 read, and 1 unread for another user.
        n1 = await NotificationRecord.create(
            workspace_id=workspace_id,
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
            workspace_id=workspace_id,
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
            workspace_id=workspace_id,
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
            workspace_id=workspace_id,
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
            resp = await client.get(f"/api/v1/workspaces/{workspace_id}/notifications/unread/preview?limit=3")
            assert resp.status_code == 200
            preview = resp.json()["data"]
            assert preview["unreadCount"] == 2
            assert len(preview["items"]) == 2
            assert {item["id"] for item in preview["items"]} == {str(n1.id), str(n2.id)}
            assert all(item.get("readAt") is None for item in preview["items"])

            # list unread only
            resp = await client.get(f"/api/v1/workspaces/{workspace_id}/notifications?status=unread&page=1&size=20")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] == 2
            assert {item["id"] for item in page["items"]} == {str(n1.id), str(n2.id)}

            # list all should include read ones (but still only for the current user)
            resp = await client.get(f"/api/v1/workspaces/{workspace_id}/notifications?status=all&page=1&size=20")
            assert resp.status_code == 200
            page_all = resp.json()["data"]
            assert page_all["total"] == 3
            assert {item["id"] for item in page_all["items"]} == {str(n1.id), str(n2.id), str(n3.id)}

            # mark read should be idempotent
            resp = await client.post(f"/api/v1/workspaces/{workspace_id}/notifications/{n1.id}/read")
            assert resp.status_code == 200
            read1 = resp.json()["data"]
            assert read1["id"] == str(n1.id)
            assert read1["readAt"] is not None

            resp = await client.post(f"/api/v1/workspaces/{workspace_id}/notifications/{n1.id}/read")
            assert resp.status_code == 200
            read2 = resp.json()["data"]
            assert read2["id"] == str(n1.id)
            assert read2["readAt"] == read1["readAt"]

            # delete should remove the record entirely (hard delete in MVP)
            resp = await client.delete(f"/api/v1/workspaces/{workspace_id}/notifications/{n2.id}")
            assert resp.status_code == 200
            deleted = resp.json()["data"]
            assert deleted["id"] == str(n2.id)

            resp = await client.get(f"/api/v1/workspaces/{workspace_id}/notifications/unread/preview?limit=3")
            assert resp.status_code == 200
            preview2 = resp.json()["data"]
            assert preview2["unreadCount"] == 0
            assert preview2["items"] == []

            resp = await client.get(f"/api/v1/workspaces/{workspace_id}/notifications?status=all&page=1&size=20")
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

        workspace_id, admin_user_id = await _bootstrap_admin_user(app)

        unread_1 = await NotificationRecord.create(
            workspace_id=workspace_id,
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
            workspace_id=workspace_id,
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
            workspace_id=workspace_id,
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
            resp = await client.post(f"/api/v1/workspaces/{workspace_id}/notifications/read-all")
            assert resp.status_code == 200
            out = resp.json()["data"]
            assert out["totalCount"] == 2
            assert out["successCount"] == 2

        await unread_1.refresh_from_db()
        await unread_2.refresh_from_db()
        assert unread_1.read_at is not None
        assert unread_2.read_at is not None


# NOTE(2026-01-31): v1 org-scoped team invitation routes were removed during the v2 refactor
# (Organization -> Workspaces). The notification integration is reworked in v2 and covered by
# workspace invite tests.
