from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.system.notification import NotificationCategory, NotificationRecord
from src.models.system.setting import SettingRecord
from src.modules.auth.http.service import get_current_user_id
from src.modules.system.admin.notifications.preferences import (
    NOTIFICATION_PREFERENCES_NAMESPACE,
)
from src.settings.scopes import SCOPE_TYPE_USER

pytestmark = pytest.mark.integration


async def _bootstrap_admin_user(app, *, org_name: str = "Test Org"):
    """
    Create an organization + an org owner user + a workspace (v2 scope).

    Returns (workspace_id, admin_user_id).
    """

    from src.models.organization.org_membership import OrgMembership, OrgRole
    from src.models.workspaces.workspace import Workspace
    from src.modules.auth.repository import UserRepository
    from src.modules.auth.tokens.service import hash_password
    from src.modules.organization.repository import OrganizationRepository

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
    await OrgMembership.create(organization_id=org.id, user_id=admin.id, role=OrgRole.OWNER, status="active")
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


async def test_me_notifications_global_endpoints(
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

        # A historical notification in another workspace that the user may not currently access.
        historical_workspace_id = uuid4()
        in_current_workspace = await NotificationRecord.create(
            workspace_id=workspace_id,
            recipient_user_id=admin_user_id,
            category=NotificationCategory.TEAM,
            title="Current workspace",
            body=None,
            target_to="/settings/team/members",
            target_meta=None,
            actor_user_id=None,
            event_name="demo.current",
            dedupe_key=None,
            read_at=None,
        )
        historical_notification = await NotificationRecord.create(
            workspace_id=historical_workspace_id,
            recipient_user_id=admin_user_id,
            category=NotificationCategory.SECURITY,
            title="Historical workspace",
            body=None,
            target_to="/settings/maintenance/status",
            target_meta=None,
            actor_user_id=None,
            event_name="demo.historical",
            dedupe_key=None,
            read_at=None,
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            current_pid = encode_uuid(in_current_workspace.id)
            historical_pid = encode_uuid(historical_notification.id)

            resp = await client.get("/api/v1/me/notifications/unread/preview?limit=10")
            assert resp.status_code == 200
            preview = resp.json()["data"]
            assert preview["unreadCount"] == 2
            assert {item["id"] for item in preview["items"]} == {current_pid, historical_pid}

            resp = await client.get("/api/v1/me/notifications?status=all&page=1&size=20")
            assert resp.status_code == 200
            page = resp.json()["data"]
            assert page["total"] == 2
            ids = {item["id"] for item in page["items"]}
            assert ids == {current_pid, historical_pid}
            workspace_ids = {item["workspaceId"] for item in page["items"]}
            assert workspace_ids == {encode_uuid(workspace_id), encode_uuid(historical_workspace_id)}

            resp = await client.post(f"/api/v1/me/notifications/{historical_pid}/read")
            assert resp.status_code == 200
            read_item = resp.json()["data"]
            assert read_item["id"] == historical_pid
            assert read_item["readAt"] is not None

            resp = await client.post("/api/v1/me/notifications/read-all")
            assert resp.status_code == 200
            out = resp.json()["data"]
            assert out["totalCount"] == 1
            assert out["successCount"] == 1

            resp = await client.delete(f"/api/v1/me/notifications/{current_pid}")
            assert resp.status_code == 200
            assert resp.json()["data"]["id"] == current_pid

            resp = await client.get("/api/v1/me/notifications?status=all&page=1&size=20")
            assert resp.status_code == 200
            page2 = resp.json()["data"]
            assert page2["total"] == 1
            assert page2["items"][0]["id"] == historical_pid


async def test_me_notification_preferences_get_and_patch(
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
        _, admin_user_id = await _bootstrap_admin_user(app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/me/notifications/preferences")
            assert resp.status_code == 200
            preferences = resp.json()["data"]
            topics = preferences["topics"]
            assert topics

            role_topic = next(
                (item for item in topics if item["key"] == "workspace.member.roles.updated"),
                None,
            )
            assert role_topic is not None
            in_app_channel = role_topic["channels"].get("inApp") or role_topic["channels"].get("in_app")
            email_channel = role_topic["channels"].get("email")
            assert in_app_channel is not None
            assert email_channel is not None
            assert in_app_channel["enabled"] is True
            assert in_app_channel["supported"] is True
            assert in_app_channel["mutable"] is True
            assert email_channel["enabled"] is False
            assert email_channel["supported"] is False
            assert email_channel["mutable"] is False

            patch_resp = await client.patch(
                "/api/v1/me/notifications/preferences",
                json={
                    "topic_key": "workspace.member.roles.updated",
                    "channel": "in_app",
                    "enabled": False,
                },
            )
            assert patch_resp.status_code == 200
            patched_topic = next(
                (
                    item
                    for item in patch_resp.json()["data"]["topics"]
                    if item["key"] == "workspace.member.roles.updated"
                ),
                None,
            )
            assert patched_topic is not None
            patched_in_app_channel = patched_topic["channels"].get("inApp") or patched_topic["channels"].get("in_app")
            assert patched_in_app_channel is not None
            assert patched_in_app_channel["enabled"] is False

            verify_resp = await client.get("/api/v1/me/notifications/preferences")
            assert verify_resp.status_code == 200
            verify_topic = next(
                (
                    item
                    for item in verify_resp.json()["data"]["topics"]
                    if item["key"] == "workspace.member.roles.updated"
                ),
                None,
            )
            assert verify_topic is not None
            verify_in_app_channel = verify_topic["channels"].get("inApp") or verify_topic["channels"].get("in_app")
            assert verify_in_app_channel is not None
            assert verify_in_app_channel["enabled"] is False

        stored = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_USER,
            scope_id=admin_user_id,
            namespace=NOTIFICATION_PREFERENCES_NAMESPACE,
        )
        assert stored is not None
        assert isinstance(stored.value, dict)
        topics_value = stored.value.get("topics")
        assert isinstance(topics_value, dict)
        role_state = topics_value.get("workspace.member.roles.updated")
        assert isinstance(role_state, dict)
        assert role_state.get("in_app") is False


async def test_me_notification_preferences_reject_unsupported_channel(
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
        await _bootstrap_admin_user(app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                "/api/v1/me/notifications/preferences",
                json={
                    "topic_key": "workspace.member.roles.updated",
                    "channel": "email",
                    "enabled": True,
                },
            )
            assert resp.status_code == 400
            payload = resp.json()
            assert payload["error"] == "CHANNEL_NOT_SUPPORTED"


# NOTE(2026-01-31): v1 org-scoped team invitation routes were removed during the v2 refactor
# (Organization -> Workspaces). The notification integration is reworked in v2 and covered by
# workspace invite tests.
