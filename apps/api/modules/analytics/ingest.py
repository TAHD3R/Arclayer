from __future__ import annotations

import asyncio
import fnmatch
import time
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from asgi_correlation_id import correlation_id
from structlog.contextvars import get_contextvars

from apps.api.config import Settings
from apps.api.core.logging import get_logger
from apps.api.modules.analytics.repository import AuditEventRepository
from apps.api.plugin.event_bus import Event, EventBus

logger = get_logger(__name__)

ACTIVITY_CONTEXT_ERRORS = (LookupError, RuntimeError, ValueError, TypeError)
_FATAL_ACTIVITY_INGEST_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_ACTIVITY_INGEST_ERRORS):
        raise exc


SENSITIVE_KEY_PARTS: tuple[str, ...] = (
    "password",
    "passwd",
    "secret",
    "token",
    "authorization",
    "cookie",
    "set-cookie",
)


def _is_sensitive_key(key: str) -> bool:
    lowered = key.strip().lower()
    return any(part in lowered for part in SENSITIVE_KEY_PARTS)


def _truncate_string(value: str, *, max_len: int) -> str:
    if max_len <= 0:
        return ""
    if len(value) <= max_len:
        return value
    return value[: max_len - 3] + "..."


def sanitize_properties(
    value: Any,
    *,
    max_keys: int,
    max_string_length: int,
    max_depth: int,
) -> Any:
    """
    Sanitize event payload to keep audit logs safe and bounded.

    This function is intentionally conservative:
    - drops sensitive keys by name
    - truncates long strings
    - limits nesting depth and total keys
    """

    if max_depth <= 0:
        return None

    if value is None:
        return None

    if isinstance(value, (bool, int, float)):
        return value

    if isinstance(value, str):
        return _truncate_string(value, max_len=max_string_length)

    if isinstance(value, list):
        # Keep list length bounded to avoid large payloads.
        out_list: list[Any] = []
        for item in value[:max_keys]:
            out_list.append(
                sanitize_properties(
                    item,
                    max_keys=max_keys,
                    max_string_length=max_string_length,
                    max_depth=max_depth - 1,
                )
            )
        return out_list

    if isinstance(value, dict):
        out_dict: dict[str, Any] = {}
        count = 0
        for k, v in value.items():
            if count >= max_keys:
                out_dict["__truncated__"] = True
                break
            if not isinstance(k, str):
                continue
            if _is_sensitive_key(k):
                continue
            out_dict[k] = sanitize_properties(
                v,
                max_keys=max_keys,
                max_string_length=max_string_length,
                max_depth=max_depth - 1,
            )
            count += 1
        return out_dict

    # Fallback: only keep a safe string representation.
    return _truncate_string(str(value), max_len=max_string_length)


def _coerce_uuid(value: Any) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _matches_allowlist(name: str, allowlist: Iterable[str]) -> bool:
    for pat in allowlist:
        if not pat:
            continue
        if pat == name:
            return True
        if "*" in pat or "?" in pat or "[" in pat:
            if fnmatch.fnmatch(name, pat):
                return True
    return False


class ActivityIngestor:
    """
    Subscribe to EventBus and persist selected events into audit log table.

    Semantics:
    - best-effort, never blocks main request flow
    - in-process queue with bounded size; drops on overload
    - periodic batch flush to Postgres
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repo = AuditEventRepository()

        audit = settings.analytics.audit_log
        self._allowlist = list(audit.event_allowlist or [])
        self._queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=audit.queue_maxsize)

        self._flush_task: asyncio.Task[None] | None = None
        self._started = False

        # Keep a stable handler reference for unsubscribe.
        self._event_handler = self._on_event

        self._dropped = 0

    async def start(self, *, event_bus: EventBus) -> None:
        if self._started:
            return

        if not self.settings.database.enabled:
            logger.info("Activity ingestor skipped (database disabled)")
            return

        if not self.settings.analytics.enabled or not self.settings.analytics.audit_log.enabled:
            logger.info("Activity ingestor skipped (analytics disabled)")
            return

        await event_bus.subscribe(
            plugin_id="core.analytics",
            event_name="*",
            handler=self._event_handler,
            priority=-100,  # should never block higher-priority domain handlers
            name="activity-ingestor",
        )
        self._flush_task = asyncio.create_task(self._flush_loop(), name="activity-flush-loop")
        self._started = True
        logger.info("Activity ingestor started")

    async def stop(self, *, event_bus: EventBus) -> None:
        if not self._started:
            return

        try:
            await event_bus.unsubscribe(plugin_id="core.analytics", event_name="*", handler=self._event_handler)
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Activity ingestor unsubscribe failed",
                plugin_id="core.analytics",
                event_name="*",
                error=str(exc),
            )

        task = self._flush_task
        self._flush_task = None
        self._started = False

        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except BaseException as exc:
                _raise_if_fatal(exc)
                logger.warning("Activity flush loop failed during shutdown", error=str(exc))

        # Best-effort final flush (bounded).
        try:
            await self._flush_once(max_batch=self.settings.analytics.audit_log.flush_batch_size)
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Activity final flush failed during shutdown", error=str(exc))

        logger.info("Activity ingestor stopped", dropped=self._dropped)

    async def _on_event(self, event: Event) -> None:
        audit = self.settings.analytics.audit_log

        if not _matches_allowlist(event.name, self._allowlist):
            return

        payload = event.payload if isinstance(event.payload, dict) else {}

        ctx = {}
        try:
            ctx = get_contextvars()
        except ACTIVITY_CONTEXT_ERRORS:
            ctx = {}

        org_id = _coerce_uuid(payload.get("organization_id") or payload.get("org_id") or ctx.get("organization_id"))
        ws_id = _coerce_uuid(payload.get("workspace_id") or ctx.get("workspace_id"))

        actor_user_id = _coerce_uuid(event.actor_user_id or payload.get("actor_user_id") or ctx.get("user_id"))
        subject_user_id = _coerce_uuid(payload.get("subject_user_id"))

        entity_type = payload.get("entity_type")
        if entity_type is not None and not isinstance(entity_type, str):
            entity_type = str(entity_type)
        entity_id = _coerce_uuid(payload.get("entity_id"))

        trace = event.trace_id or correlation_id.get(None)
        source = event.source

        # Avoid storing redundant ids in properties.
        properties_raw = {
            k: v
            for k, v in payload.items()
            if k
            not in {
                "organization_id",
                "org_id",
                "workspace_id",
                "actor_user_id",
                "subject_user_id",
                "entity_type",
                "entity_id",
            }
        }
        properties = sanitize_properties(
            properties_raw,
            max_keys=audit.max_property_keys,
            max_string_length=audit.max_string_length,
            max_depth=audit.max_depth,
        )

        row = {
            "occurred_at": event.occurred_at if event.occurred_at is not None else datetime.now(UTC),
            "event_name": event.name,
            "organization_id": org_id,
            "workspace_id": ws_id,
            "actor_user_id": actor_user_id,
            "subject_user_id": subject_user_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "trace_id": trace,
            "source": source,
            "properties": properties if isinstance(properties, dict) else None,
        }

        try:
            self._queue.put_nowait(row)
        except asyncio.QueueFull:
            # Protect request path: drop on overload.
            self._dropped += 1
            if self._dropped % 100 == 1:
                logger.warning(
                    "Audit log queue full; dropping events",
                    dropped=self._dropped,
                    event_name=event.name,
                    queue_maxsize=audit.queue_maxsize,
                )

    async def _flush_once(self, *, max_batch: int) -> int:
        if max_batch <= 0:
            return 0

        batch: list[dict[str, Any]] = []
        while len(batch) < max_batch:
            try:
                batch.append(self._queue.get_nowait())
            except asyncio.QueueEmpty:
                break

        if not batch:
            return 0

        started = time.perf_counter()
        try:
            await self.repo.create_many(rows=batch)
        finally:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            if elapsed_ms >= 200:
                logger.warning("Audit log insert slow", elapsed_ms=elapsed_ms, batch=len(batch))
        return len(batch)

    async def _flush_loop(self) -> None:
        audit = self.settings.analytics.audit_log
        interval = audit.flush_interval_ms / 1000.0
        batch_size = audit.flush_batch_size

        while True:
            batch: list[dict[str, Any]] = []
            try:
                first = await asyncio.wait_for(self._queue.get(), timeout=interval)
                batch.append(first)
            except asyncio.TimeoutError:
                # No new events; still try flushing whatever is buffered.
                pass

            while len(batch) < batch_size:
                try:
                    batch.append(self._queue.get_nowait())
                except asyncio.QueueEmpty:
                    break

            if not batch:
                continue

            started = time.perf_counter()
            try:
                await self.repo.create_many(rows=batch)
            except BaseException as exc:
                _raise_if_fatal(exc)
                # Best-effort: do not crash the loop, but log for operators.
                logger.exception("Audit log flush failed", error=str(exc))
            finally:
                elapsed_ms = int((time.perf_counter() - started) * 1000)
                if elapsed_ms >= 200:
                    logger.warning("Audit log insert slow", elapsed_ms=elapsed_ms, batch=len(batch))
