from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.core.events import Event, EventBus
from src.modules.system.admin.notifications import event_runtime as module
from src.modules.system.admin.notifications.event_runtime import (
    NOTIFICATION_EVENT_NAMES,
    SUBSCRIBER_ID,
    NotificationEventRuntime,
)


@dataclass(frozen=True)
class _Recipient:
    id: UUID
    email: str | None


class _AudienceReader:
    def __init__(self, *, users: list[_Recipient]) -> None:
        self.users = users
        self.requested_user_ids: list[UUID] = []

    async def get_active_users(self, user_ids: Sequence[UUID]) -> list[_Recipient]:
        self.requested_user_ids.extend(user_ids)
        requested = set(user_ids)
        return [user for user in self.users if user.id in requested]


class _EmailSender:
    def __init__(self) -> None:
        self.messages: list[dict[str, object]] = []

    async def send_notification(self, **kwargs: object) -> object:
        self.messages.append(kwargs)
        return object()


@pytest.mark.asyncio
async def test_notification_runtime_subscribes_and_unsubscribes_all_events() -> None:
    runtime = NotificationEventRuntime(
        Settings(),
        audience_reader=_AudienceReader(users=[]),
        email_sender=_EmailSender(),
    )
    bus = EventBus()

    await runtime.start(event_bus=bus)
    snapshot = await bus.snapshot()

    assert set(snapshot) == set(NOTIFICATION_EVENT_NAMES)
    assert all(entry["subscriber_id"] == SUBSCRIBER_ID for entries in snapshot.values() for entry in entries)

    await runtime.stop(event_bus=bus)
    assert await bus.snapshot() == {}


@pytest.mark.asyncio
async def test_workflow_event_prefers_assignee_and_delivers_opted_in_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_id = uuid4()
    assignee = _Recipient(uuid4(), "assignee@example.com")
    workspace_id = uuid4()
    audience = _AudienceReader(users=[assignee])
    email_sender = _EmailSender()
    created: list[dict[str, object]] = []

    async def enabled_policy(**_kwargs: object) -> bool:
        return True

    async def enabled_channel(*, channel: str, **_kwargs: object) -> bool:
        return channel in {"in_app", "email"}

    async def create_record(**kwargs: object) -> object:
        created.append(kwargs)
        return object()

    monkeypatch.setattr(module, "is_notification_group_enabled_for_event", enabled_policy)
    monkeypatch.setattr(module, "is_notification_channel_enabled_for_event", enabled_channel)
    monkeypatch.setattr(module, "create_notification_record", create_record)
    monkeypatch.setattr(module, "t", lambda _namespace, key, **_kwargs: key)
    runtime = NotificationEventRuntime(
        Settings(),
        audience_reader=audience,
        email_sender=email_sender,
    )

    await runtime.handle_event(
        Event(
            name="project.content.item.workflow.updated",
            actor_user_id=str(actor_id),
            trace_id="trace-1",
            payload={
                "workspace_id": str(workspace_id),
                "entity_id": str(uuid4()),
                "entity_type": "content_item",
                "workflow_assignee_user_id": str(assignee.id),
            },
        )
    )

    assert audience.requested_user_ids == [assignee.id]
    assert len(created) == 1
    assert created[0]["workspace_id"] == workspace_id
    assert created[0]["recipient_user_id"] == assignee.id
    assert created[0]["actor_user_id"] == actor_id
    assert created[0]["event_name"] == "project.content.item.workflow.updated"
    assert email_sender.messages[0]["recipient"] == "assignee@example.com"
    assert email_sender.messages[0]["action_to"] == "/settings/content"


@pytest.mark.asyncio
async def test_project_event_without_recipient_surfaces_contract_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def enabled_policy(**_kwargs: object) -> bool:
        return True

    monkeypatch.setattr(module, "is_notification_group_enabled_for_event", enabled_policy)
    runtime = NotificationEventRuntime(
        Settings(),
        audience_reader=_AudienceReader(users=[]),
        email_sender=_EmailSender(),
    )

    with pytest.raises(ValueError, match="no active recipients"):
        await runtime.handle_event(
            Event(
                name="project.api_key.revoked",
                payload={"workspace_id": str(uuid4()), "entity_id": str(uuid4())},
            )
        )
