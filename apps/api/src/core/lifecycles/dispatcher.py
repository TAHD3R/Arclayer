from __future__ import annotations

import asyncio
from typing import Any

from src.core.lifecycles.specs import LifecycleAction, LifecycleEvent, LifecycleSubscriber
from src.core.logging import get_logger

logger = get_logger(__name__)

_FATAL_DISPATCH_ERRORS: tuple[type[BaseException], ...] = (
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)
_BLOCKING_ACTIONS: frozenset[LifecycleAction] = frozenset({
    LifecycleAction.BEFORE_CREATE,
    LifecycleAction.BEFORE_UPDATE,
    LifecycleAction.BEFORE_DELETE,
    LifecycleAction.BEFORE_PUBLISH,
})


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_DISPATCH_ERRORS):
        raise exc


class LifecycleDispatcher:
    """Simple dict-based subscriber registry for lifecycle hooks.

    Subscribers are async callables registered per action. The dispatcher
    calls before/after hooks around CRUD operations in the EntityManager.
    State is passed between before/after pairs via a mutable state dict on
    the LifecycleEvent.
    """

    def __init__(self) -> None:
        self._subscribers: dict[LifecycleAction, list[tuple[str, LifecycleSubscriber]]] = {}
        self._lock = asyncio.Lock()

    async def register(
        self,
        *,
        subscriber_id: str,
        action: LifecycleAction,
        handler: LifecycleSubscriber,
    ) -> None:
        if not subscriber_id or not action:
            raise ValueError("subscriber_id and action are required")
        async with self._lock:
            entries = self._subscribers.setdefault(action, [])
            entries.append((subscriber_id, handler))

    async def unregister(
        self,
        *,
        subscriber_id: str,
        action: LifecycleAction | None = None,
        handler: LifecycleSubscriber | None = None,
    ) -> None:
        async with self._lock:
            actions: list[LifecycleAction]
            if action is not None:
                actions = [action]
            else:
                actions = list(self._subscribers.keys())
            for action_key in actions:
                entries = self._subscribers.get(action_key, [])
                if not entries:
                    continue
                self._subscribers[action_key] = [
                    (sid, h) for sid, h in entries if not (sid == subscriber_id and (handler is None or h == handler))
                ]
                if not self._subscribers[action_key]:
                    self._subscribers.pop(action_key, None)

    async def unregister_all(self, subscriber_id: str) -> None:
        await self.unregister(subscriber_id=subscriber_id)

    async def dispatch(self, event: LifecycleEvent) -> None:
        entries = await self._get_subscribers(event.action)
        if not entries:
            return
        for subscriber_id, handler in entries:
            try:
                await handler(event)
            except asyncio.CancelledError:
                raise
            except BaseException as exc:
                _raise_if_fatal(exc)
                logger.exception(
                    "Lifecycle subscriber failed",
                    action=event.action,
                    model_key=event.model_key,
                    subscriber_id=subscriber_id,
                    error=str(exc),
                )
                if event.action in _BLOCKING_ACTIONS:
                    raise

    async def dispatch_before(
        self,
        *,
        action: LifecycleAction,
        model_key: str,
        workspace_id: Any | None = None,
        site_id: Any | None = None,
        item_id: Any | None = None,
        data: dict[str, Any] | None = None,
        actor_id: Any | None = None,
    ) -> LifecycleEvent:
        event = LifecycleEvent(
            action=action,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            data=data or {},
            actor_id=actor_id,
        )
        await self.dispatch(event)
        return event

    async def dispatch_after(
        self,
        *,
        action: LifecycleAction,
        model_key: str,
        workspace_id: Any | None = None,
        site_id: Any | None = None,
        item_id: Any | None = None,
        result: Any = None,
        actor_id: Any | None = None,
        state: dict[str, Any] | None = None,
    ) -> None:
        event = LifecycleEvent(
            action=action,
            model_key=model_key,
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            result=result,
            actor_id=actor_id,
            state=state or {},
        )
        await self.dispatch(event)

    async def _get_subscribers(self, action: LifecycleAction) -> list[tuple[str, LifecycleSubscriber]]:
        async with self._lock:
            return list(self._subscribers.get(action, []))

    @property
    def registered_actions(self) -> frozenset[LifecycleAction]:
        return frozenset(self._subscribers.keys())
