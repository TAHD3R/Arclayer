from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.config import Settings
from src.models.system.notification import NotificationCategory
from src.modules.system.admin.notifications import catalog
from src.settings.core_schema import CORE_SETTINGS_SCHEMA


def test_core_notifications_schema_uses_group_policy_shape() -> None:
    notifications_section = next(section for section in CORE_SETTINGS_SCHEMA.sections if section.id == "notifications")
    notification_keys = {field.key for field in notifications_section.fields}

    assert "groups" in notification_keys
    assert "invite_enabled" not in notification_keys

    groups_field = next(field for field in notifications_section.fields if field.key == "groups")
    assert groups_field.default == {
        "team": {"enabled": True},
        "security": {"enabled": True},
        "content": {"enabled": True},
        "automation": {"enabled": True},
        "system": {"enabled": False},
    }


def test_notification_catalog_includes_first_slice_sources() -> None:
    catalog_events = {definition.event_name for definition in catalog.NOTIFICATION_DEFINITIONS}

    assert {
        "workspace.invitation.accepted",
        "workspace.member.password.reset",
        "project.api_key.rotated",
        "project.api_key.revoked",
        "project.content.item.workflow.updated",
        "project.release.scheduled_publish.failed",
        "automation.notification",
        "system.mail.updated",
        "system.broadcast",
    }.issubset(catalog_events)
    automation_definition = catalog.get_notification_definition("automation.notification")
    assert automation_definition is not None
    assert automation_definition.group == "automation"


@pytest.mark.asyncio
async def test_notification_group_policy_uses_defaults_when_group_is_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_core_settings(_settings: Settings) -> dict[str, object]:
        return {"notifications": {"groups": {}}}

    monkeypatch.setattr(catalog, "get_core_settings_value_cached", fake_core_settings)

    assert (
        await catalog.is_notification_group_enabled_for_event(
            settings=Settings(),
            event_name="workspace.invitation.accepted",
        )
        is True
    )
    assert (
        await catalog.is_notification_group_enabled_for_event(
            settings=Settings(),
            event_name="system.mail.updated",
        )
        is False
    )


@pytest.mark.asyncio
async def test_create_notification_record_stops_before_user_preferences_when_group_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_core_settings(_settings: Settings) -> dict[str, object]:
        return {
            "notifications": {
                "groups": {
                    "team": {"enabled": False},
                }
            }
        }

    async def fail_user_preference_check(**_kwargs: object) -> bool:
        raise AssertionError("user preference gate should not run when system policy disables group")

    async def fail_create(**_kwargs: object) -> object:
        raise AssertionError("notification record should not be created when group is disabled")

    monkeypatch.setattr(catalog, "get_core_settings_value_cached", fake_core_settings)
    monkeypatch.setattr(catalog, "is_notification_channel_enabled_for_event", fail_user_preference_check)
    monkeypatch.setattr(catalog.NotificationRecord, "create", fail_create)

    record = await catalog.create_notification_record(
        settings=Settings(),
        workspace_id=uuid4(),
        recipient_user_id=uuid4(),
        category=NotificationCategory.TEAM,
        title="Invite accepted",
        body=None,
        target_to="/settings/team/members",
        event_name="workspace.invitation.accepted",
    )

    assert record is None


@pytest.mark.asyncio
async def test_create_notification_record_creates_after_system_and_user_gates_pass(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_core_settings(_settings: Settings) -> dict[str, object]:
        return {
            "notifications": {
                "groups": {
                    "automation": {"enabled": True},
                }
            }
        }

    async def allow_user_preference(**_kwargs: object) -> bool:
        return True

    created_kwargs: dict[str, object] = {}

    async def fake_create(**kwargs: object) -> object:
        created_kwargs.update(kwargs)
        return SimpleNamespace(id=uuid4())

    monkeypatch.setattr(catalog, "get_core_settings_value_cached", fake_core_settings)
    monkeypatch.setattr(catalog, "is_notification_channel_enabled_for_event", allow_user_preference)
    monkeypatch.setattr(catalog.NotificationRecord, "create", fake_create)

    record = await catalog.create_notification_record(
        settings=Settings(),
        workspace_id=uuid4(),
        recipient_user_id=uuid4(),
        category=NotificationCategory.TASK,
        title="Automation notification",
        body="Automation ran",
        target_to=None,
        event_name="automation.notification",
    )

    assert record is not None
    assert created_kwargs["event_name"] == "automation.notification"
    assert created_kwargs["target_to"] == "/notifications"
