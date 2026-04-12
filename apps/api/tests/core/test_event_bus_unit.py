from __future__ import annotations

import asyncio

import pytest

from apps.api.src.core.events import Event, EventBus


@pytest.mark.asyncio
async def test_event_bus_publish_and_wait_calls_handlers() -> None:
    bus = EventBus()
    called: list[str] = []

    async def _h1(event: Event) -> None:
        called.append(f"h1:{event.name}")

    async def _h2(event: Event) -> None:
        await asyncio.sleep(0)
        called.append(f"h2:{event.name}")

    await bus.subscribe(subscriber_id="p1", event_name="demo", handler=_h1)
    await bus.subscribe(subscriber_id="p2", event_name="demo", handler=_h2)
    await bus.publish_and_wait(Event(name="demo"))
    assert "h1:demo" in called
    assert "h2:demo" in called


@pytest.mark.asyncio
async def test_event_bus_unsubscribe_all_removes_handlers() -> None:
    bus = EventBus()
    called = 0

    async def _h(event: Event) -> None:
        nonlocal called
        called += 1

    await bus.subscribe(subscriber_id="p1", event_name="demo", handler=_h)
    await bus.unsubscribe_all("p1")
    await bus.publish_and_wait(Event(name="demo"))
    assert called == 0


@pytest.mark.asyncio
async def test_event_bus_once_subscription() -> None:
    bus = EventBus()
    called = 0

    async def _h(event: Event) -> None:
        nonlocal called
        called += 1

    await bus.subscribe(subscriber_id="p1", event_name="demo", handler=_h, once=True)
    await bus.publish_and_wait(Event(name="demo"))
    await bus.publish_and_wait(Event(name="demo"))
    assert called == 1
