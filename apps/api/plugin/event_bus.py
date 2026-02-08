from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from pydantic import ConfigDict, Field

from apps.api.common.schemas import BaseSchema
from apps.api.core.logging import get_logger

logger = get_logger(__name__)
_FATAL_EVENT_BUS_ERRORS: tuple[type[BaseException], ...] = (
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_EVENT_BUS_ERRORS):
        raise exc


EventHandler = Callable[["Event"], Awaitable[None]]


class Event(BaseSchema):
    """
    In-process event contract for plugin decoupling.

    Notes:
    - Keep payload minimal (ids + type + action). Avoid dumping sensitive data.
    - Version is for forward-compatible evolution of payload shape.
    """

    model_config = ConfigDict(frozen=True)

    name: str
    payload: dict[str, Any] = Field(default_factory=dict)
    version: str = "1.0"
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source: str | None = None
    # Use a single name everywhere (logging/meta) to avoid request_id vs trace_id confusion.
    trace_id: str | None = None
    actor_user_id: str | None = None


class _Subscription(BaseSchema):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    plugin_id: str
    handler: EventHandler
    priority: int = 0
    once: bool = False
    name: str | None = None  # Optional friendly name for diagnostics/logging.


class EventBus:
    """
    Async in-process publish/subscribe bus.

    Default semantics:
    - publish(): fire-and-forget (does not block the main flow)
    - publish_and_wait(): wait for handlers (use sparingly, with timeout)
    """

    def __init__(self) -> None:
        self._subs: dict[str, list[_Subscription]] = {}
        self._lock = asyncio.Lock()
        self._tasks: set[asyncio.Task[None]] = set()

    async def subscribe(
        self,
        *,
        plugin_id: str,
        event_name: str,
        handler: EventHandler,
        priority: int = 0,
        once: bool = False,
        name: str | None = None,
    ) -> None:
        if not plugin_id or not event_name:
            raise ValueError("plugin_id and event_name are required")
        sub = _Subscription(plugin_id=plugin_id, handler=handler, priority=priority, once=once, name=name)
        async with self._lock:
            entries = self._subs.setdefault(event_name, [])
            entries.append(sub)
            entries.sort(key=lambda s: s.priority, reverse=True)

    async def unsubscribe(
        self,
        *,
        plugin_id: str,
        event_name: str,
        handler: EventHandler | None = None,
    ) -> None:
        async with self._lock:
            entries = self._subs.get(event_name, [])
            if not entries:
                return
            self._subs[event_name] = [
                s for s in entries if not (s.plugin_id == plugin_id and (handler is None or s.handler == handler))
            ]
            if not self._subs[event_name]:
                self._subs.pop(event_name, None)

    async def unsubscribe_all(self, plugin_id: str) -> None:
        async with self._lock:
            for key in list(self._subs.keys()):
                self._subs[key] = [s for s in self._subs[key] if s.plugin_id != plugin_id]
                if not self._subs[key]:
                    self._subs.pop(key, None)

    async def publish(self, event: Event) -> None:
        # Fire-and-forget: schedule all handlers and return immediately.
        subs = await self._get_subscribers(event.name)
        if not subs:
            return
        for sub in subs:
            task = asyncio.create_task(self._run_handler(sub, event))
            self._track_task(task)

    async def publish_and_wait(self, event: Event, *, timeout: float | None = None) -> None:
        subs = await self._get_subscribers(event.name)
        if not subs:
            return
        tasks = [asyncio.create_task(self._run_handler(sub, event)) for sub in subs]
        for t in tasks:
            self._track_task(t)
        if timeout is None:
            await asyncio.gather(*tasks, return_exceptions=True)
            return
        try:
            await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=timeout)
        except TimeoutError:
            logger.warning("Event handlers timed out", event_name=event.name, timeout=timeout)

    async def aclose(self) -> None:
        # Best-effort cancellation for pending tasks on shutdown.
        tasks = list(self._tasks)
        for t in tasks:
            t.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._tasks.clear()

    async def snapshot(self) -> dict[str, list[dict[str, Any]]]:
        """
        Diagnostic snapshot for observability endpoints.
        """

        async with self._lock:
            out: dict[str, list[dict[str, Any]]] = {}
            for event_name, subs in self._subs.items():
                out[event_name] = [
                    {
                        "plugin_id": s.plugin_id,
                        "priority": s.priority,
                        "once": s.once,
                        "name": s.name or getattr(s.handler, "__name__", "handler"),
                    }
                    for s in subs
                ]
            return out

    async def _get_subscribers(self, event_name: str) -> list[_Subscription]:
        async with self._lock:
            exact = list(self._subs.get(event_name, []))
            wildcard = list(self._subs.get("*", []))
            # Merge while preserving relative priority ordering (both lists are already sorted).
            merged = sorted(exact + wildcard, key=lambda s: s.priority, reverse=True)
            return merged

    async def _run_handler(self, sub: _Subscription, event: Event) -> None:
        started = time.perf_counter()
        handler_name = sub.name or getattr(sub.handler, "__name__", "handler")
        try:
            await sub.handler(event)
        except asyncio.CancelledError:
            raise
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.exception(
                "Event handler failed",
                event_name=event.name,
                plugin_id=sub.plugin_id,
                handler=handler_name,
                error=str(exc),
            )
        finally:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            if elapsed_ms >= 500:
                logger.warning(
                    "Event handler slow",
                    event_name=event.name,
                    plugin_id=sub.plugin_id,
                    handler=handler_name,
                    elapsed_ms=elapsed_ms,
                )
            if sub.once:
                # Best-effort: remove after first execution.
                await self.unsubscribe(plugin_id=sub.plugin_id, event_name=event.name, handler=sub.handler)

    def _track_task(self, task: asyncio.Task[None]) -> None:
        self._tasks.add(task)

        def _done(t: asyncio.Task[None]) -> None:
            self._tasks.discard(t)
            try:
                _ = t.result()
            except asyncio.CancelledError:
                return
            except BaseException as exc:  # pragma: no cover
                _raise_if_fatal(exc)
                # _run_handler already logs exceptions; this is a last resort.
                logger.warning("Event task failed", error=str(exc))

        task.add_done_callback(_done)
