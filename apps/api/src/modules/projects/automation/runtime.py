from __future__ import annotations

import asyncio

from src.config import Settings
from src.core.events import Event, EventBus
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.core.logging import get_logger
from src.modules.commerce.dunning.command_policy import build_restricted_recovery_command_policy
from src.modules.projects.automation.catalog import list_automation_triggers
from src.modules.projects.automation.service import ProjectAutomationService

logger = get_logger(__name__)
SUBSCRIBER_ID = "project.automation"
_FATAL_AUTOMATION_RUNTIME_ERRORS = (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_AUTOMATION_RUNTIME_ERRORS):
        raise exc


class AutomationRuntime:
    def __init__(self, settings: Settings, *, lifecycle_dispatcher: LifecycleDispatcher) -> None:
        self.service = ProjectAutomationService(
            settings,
            lifecycle_dispatcher=lifecycle_dispatcher,
            commercial_effect_authorizer=build_restricted_recovery_command_policy(),
        )

    async def start(self, *, event_bus: EventBus) -> None:
        for trigger in list_automation_triggers():
            await event_bus.subscribe(
                subscriber_id=SUBSCRIBER_ID,
                event_name=trigger.event_name,
                handler=self.handle_event,
                priority=-10,
                name=f"automation:{trigger.kind.value}",
            )

    async def stop(self, *, event_bus: EventBus) -> None:
        await event_bus.unsubscribe_all(SUBSCRIBER_ID)

    async def handle_event(self, event: Event) -> None:
        try:
            await self.service.handle_event(event)
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Automation runtime event handling failed", event_name=event.name, error=str(exc))
