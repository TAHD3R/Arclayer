from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel
from src.core.events import Event, EventBus
from src.core.registries import ConnectorRegistry
from src.modules.analytics.connector_runtime import AnalyticsConnectorRuntime


@dataclass
class _AnalyticsConnector:
    enabled: bool = True
    captured: list[Event] = field(default_factory=list)
    closed: bool = False

    async def capture_event(self, event: Event) -> None:
        self.captured.append(event)

    async def close(self) -> None:
        self.closed = True


def _register(registry: ConnectorRegistry, key: str, connector: object) -> None:
    registry.register(
        extension="analytics-test",
        definition=ConnectorDefinition(
            key=key,
            kind=ConnectorKind.ANALYTICS,
            version="1.0.0",
            trust_level=ConnectorTrustLevel.THIRD_PARTY,
        ),
        factory=lambda: connector,
    )


@pytest.mark.asyncio
async def test_analytics_connector_runtime_fans_out_domain_events_and_closes() -> None:
    enabled = _AnalyticsConnector()
    disabled = _AnalyticsConnector(enabled=False)
    registry = ConnectorRegistry()
    _register(registry, "analytics.enabled", enabled)
    _register(registry, "analytics.disabled", disabled)
    event_bus = EventBus()
    runtime = AnalyticsConnectorRuntime(registry)

    await runtime.start(event_bus=event_bus)
    event = Event(name="project.created", actor_user_id="user-1")
    await event_bus.publish_and_wait(event)
    await runtime.stop()

    assert enabled.captured == [event]
    assert enabled.closed is True
    assert disabled.captured == []
    assert disabled.closed is True


@pytest.mark.asyncio
async def test_analytics_connector_runtime_rejects_invalid_connector_contract() -> None:
    registry = ConnectorRegistry()
    _register(registry, "analytics.invalid", object())

    with pytest.raises(TypeError, match="does not implement AnalyticsConnector"):
        await AnalyticsConnectorRuntime(registry).start(event_bus=EventBus())
