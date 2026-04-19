from __future__ import annotations

import pytest

from src.core.events import Event, EventBus
from src.modules.workspaces.automation.runtime import AutomationRuntime


class _FakeSettings:
    pass


@pytest.mark.asyncio
async def test_automation_runtime_subscribes_all_trigger_events() -> None:
    runtime = AutomationRuntime(_FakeSettings())  # type: ignore[arg-type]
    bus = EventBus()

    await runtime.start(event_bus=bus)
    snapshot = await bus.snapshot()

    assert "workspace.release.published" in snapshot
    assert "workspace.content.item.workflow.updated" in snapshot
    assert "workspace.api_key.rotated" in snapshot
    assert "workspace.preview_token.created" in snapshot
    assert all(entry["subscriber_id"] == "workspace.automation" for entries in snapshot.values() for entry in entries)


@pytest.mark.asyncio
async def test_automation_runtime_unsubscribes_all_handlers_on_stop() -> None:
    runtime = AutomationRuntime(_FakeSettings())  # type: ignore[arg-type]
    bus = EventBus()

    await runtime.start(event_bus=bus)
    await runtime.stop(event_bus=bus)

    assert await bus.snapshot() == {}


@pytest.mark.asyncio
async def test_automation_runtime_delegates_event_to_service(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime = AutomationRuntime(_FakeSettings())  # type: ignore[arg-type]
    observed: list[str] = []

    async def _fake_handle_event(event: Event) -> None:
        observed.append(event.name)

    monkeypatch.setattr(runtime.service, "handle_event", _fake_handle_event)

    await runtime.handle_event(Event(name="workspace.release.published", payload={"workspace_id": "x"}))

    assert observed == ["workspace.release.published"]
