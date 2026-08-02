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
from src.modules.system.admin.notifications.schema import NotificationProjectTarget


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


@pytest.mark.asyncio
async def test_notification_runtime_subscribes_and_unsubscribes_all_events() -> None:
    runtime = NotificationEventRuntime(
        Settings(),
        audience_reader=_AudienceReader(users=[]),
    )
    bus = EventBus()

    await runtime.start(event_bus=bus)
    snapshot = await bus.snapshot()

    assert set(snapshot) == set(NOTIFICATION_EVENT_NAMES)
    assert all(entry["subscriber_id"] == SUBSCRIBER_ID for entries in snapshot.values() for entry in entries)

    await runtime.stop(event_bus=bus)
    assert await bus.snapshot() == {}


@pytest.mark.asyncio
async def test_workflow_event_prefers_assignee_and_creates_in_app_delivery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_id = uuid4()
    assignee = _Recipient(uuid4(), "assignee@example.com")
    workspace_id = uuid4()
    project_id = uuid4()
    entity_id = uuid4()
    audience = _AudienceReader(users=[assignee])
    created: list[dict[str, object]] = []

    async def create_record(**kwargs: object) -> object:
        created.append(kwargs)
        return object()

    monkeypatch.setattr(module, "create_notification_record", create_record)
    runtime = NotificationEventRuntime(
        Settings(),
        audience_reader=audience,
    )

    await runtime.handle_event(
        Event(
            name="project.content.item.workflow.updated",
            actor_user_id=str(actor_id),
            trace_id="trace-1",
            payload={
                "workspace_id": str(workspace_id),
                "project_id": str(project_id),
                "entity_id": str(entity_id),
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
    target = created[0]["target"]
    assert isinstance(target, NotificationProjectTarget)
    assert target.project_id == project_id
    assert target.entity_id == entity_id
    assert target.destination == "content_library"
    assert target.focus == "content_item"


@pytest.mark.asyncio
async def test_project_event_without_recipient_surfaces_contract_error(
) -> None:
    runtime = NotificationEventRuntime(
        Settings(),
        audience_reader=_AudienceReader(users=[]),
    )

    with pytest.raises(ValueError, match="no active recipients"):
        await runtime.handle_event(
            Event(
                name="project.api_key.revoked",
                payload={
                    "workspace_id": str(uuid4()),
                    "project_id": str(uuid4()),
                    "entity_id": str(uuid4()),
                },
            )
        )
