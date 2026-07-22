from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.modules.system.admin.notifications import broadcast_service as module
from src.modules.system.admin.notifications.broadcast_schema import (
    GlobalNotificationBroadcastIn,
    GlobalNotificationPresentation,
    GlobalNotificationSeverity,
)
from src.modules.system.admin.notifications.broadcast_service import (
    GLOBAL_NOTIFICATION_EVENT,
    GLOBAL_NOTIFICATION_WORKSPACE_ID,
    BroadcastAudienceReader,
    GlobalNotificationBroadcastService,
)


@dataclass(frozen=True)
class _Recipient:
    id: UUID
    email: str | None


class _AudienceReader:
    def __init__(self, recipients: list[_Recipient]) -> None:
        self.recipients = recipients
        self.calls = 0

    async def list_active_users(self) -> list[_Recipient]:
        self.calls += 1
        return self.recipients


class _EmailSender:
    def __init__(self, *, enabled: bool = True) -> None:
        self.enabled = enabled
        self.messages: list[dict[str, object]] = []

    async def is_enabled(self) -> bool:
        return self.enabled

    async def send_notification(self, **kwargs: object) -> object:
        self.messages.append(kwargs)
        return object()


@pytest.mark.asyncio
async def test_broadcast_stops_before_audience_when_system_policy_is_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def disabled_policy(**_kwargs: object) -> bool:
        return False

    audience = _AudienceReader([_Recipient(uuid4(), "user@example.com")])
    monkeypatch.setattr(module, "is_notification_group_enabled_for_event", disabled_policy)
    service = GlobalNotificationBroadcastService(
        Settings(),
        audience_reader=cast(BroadcastAudienceReader, audience),
        email_sender=_EmailSender(),
    )

    result = await service.create_broadcast(
        payload=GlobalNotificationBroadcastIn(title="Maintenance"),
        actor_user_id=uuid4(),
    )

    assert result.policy_enabled is False
    assert result.audience_count == 0
    assert result.in_app_delivered_count == 0
    assert result.email_delivered_count == 0
    assert audience.calls == 0


@pytest.mark.asyncio
async def test_broadcast_delivers_explicit_surface_and_opted_in_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first_user = _Recipient(uuid4(), "first@example.com")
    second_user = _Recipient(uuid4(), "second@example.com")
    audience = _AudienceReader([first_user, second_user])
    email_sender = _EmailSender()
    created: list[dict[str, object]] = []

    async def enabled_policy(**_kwargs: object) -> bool:
        return True

    async def enabled_email_preference(*, user_id: UUID, **_kwargs: object) -> bool:
        return user_id == first_user.id

    async def create_record(**kwargs: object) -> object:
        created.append(kwargs)
        return SimpleNamespace(id=uuid4())

    monkeypatch.setattr(module, "is_notification_group_enabled_for_event", enabled_policy)
    monkeypatch.setattr(module, "is_notification_channel_enabled_for_event", enabled_email_preference)
    monkeypatch.setattr(module, "create_notification_record", create_record)
    service = GlobalNotificationBroadcastService(
        Settings(),
        audience_reader=cast(BroadcastAudienceReader, audience),
        email_sender=email_sender,
    )

    result = await service.create_broadcast(
        payload=GlobalNotificationBroadcastIn(
            title="Maintenance window",
            body="The system will restart at 02:00 UTC.",
            presentation=GlobalNotificationPresentation.BANNER,
            severity=GlobalNotificationSeverity.WARNING,
            action_label="View status",
            action_to="/system/overview",
            deliver_email=True,
        ),
        actor_user_id=uuid4(),
    )

    assert result.policy_enabled is True
    assert result.audience_count == 2
    assert result.in_app_delivered_count == 2
    assert result.email_delivered_count == 1
    assert len(created) == 2
    assert created[0]["workspace_id"] == GLOBAL_NOTIFICATION_WORKSPACE_ID
    assert created[0]["event_name"] == GLOBAL_NOTIFICATION_EVENT
    assert created[0]["target_meta"] == {
        "broadcastId": str(result.broadcast_id),
        "presentation": "banner",
        "severity": "warning",
        "actionLabel": "View status",
    }
    assert email_sender.messages == [
        {
            "recipient": "first@example.com",
            "title": "Maintenance window",
            "body": "The system will restart at 02:00 UTC.",
            "action_to": "/system/overview",
            "action_label": "View status",
        }
    ]
