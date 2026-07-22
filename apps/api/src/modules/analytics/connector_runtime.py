from __future__ import annotations

from src.core.connectors import ConnectorKind
from src.core.events import Event, EventBus
from src.core.logging import get_logger
from src.core.registries import ConnectorRegistry
from src.modules.analytics.connector import AnalyticsConnector

logger = get_logger(__name__)

_SUBSCRIBER_ID = "core.analytics.connectors"


class AnalyticsConnectorRuntime:
    def __init__(self, connector_registry: ConnectorRegistry) -> None:
        self._registry = connector_registry
        self._connectors: tuple[AnalyticsConnector, ...] = ()
        self._event_bus: EventBus | None = None

    async def start(self, *, event_bus: EventBus) -> None:
        connectors: list[AnalyticsConnector] = []
        for registration in self._registry.list_registrations():
            if registration.definition.kind is not ConnectorKind.ANALYTICS:
                continue
            connector = registration.factory()
            if not isinstance(connector, AnalyticsConnector):
                raise TypeError(
                    f"Analytics connector '{registration.definition.key}' does not implement AnalyticsConnector"
                )
            if not connector.enabled:
                logger.info(
                    "Analytics Connector disabled",
                    connector=registration.definition.key,
                )
                await connector.close()
                continue
            connectors.append(connector)

        self._connectors = tuple(connectors)
        self._event_bus = event_bus
        if not self._connectors:
            logger.info("No enabled analytics Connectors registered")
            return

        await event_bus.subscribe(
            subscriber_id=_SUBSCRIBER_ID,
            event_name="*",
            handler=self._capture_event,
            priority=-100,
            name="analytics-connector-fanout",
        )
        logger.info("Analytics Connector runtime started", connector_count=len(self._connectors))

    async def stop(self) -> None:
        if self._event_bus is not None:
            await self._event_bus.unsubscribe_all(_SUBSCRIBER_ID)
        for connector in self._connectors:
            await connector.close()
        self._connectors = ()
        self._event_bus = None

    async def _capture_event(self, event: Event) -> None:
        errors: list[Exception] = []
        for connector in self._connectors:
            try:
                await connector.capture_event(event)
            except Exception as exc:
                errors.append(exc)
                logger.exception(
                    "Analytics Connector delivery failed",
                    event_name=event.name,
                    connector=type(connector).__name__,
                    error=str(exc),
                )
        if errors:
            raise ExceptionGroup("Analytics Connector delivery failed", errors)
