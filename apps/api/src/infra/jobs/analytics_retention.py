from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from tortoise import Tortoise

from apps.api.src.config import Settings
from apps.api.src.core.logging import get_logger
from apps.api.src.models.analytics.audit_event import AuditEvent

logger = get_logger(__name__)

# 64-bit Postgres advisory lock key (namespace: analytics audit log retention).
_RETENTION_LOCK_KEY = 781_234_991_223_451_771


def _parse_execute_query_result(result: Any) -> list[Any] | None:
    """
    Tortoise's execute_query return shape depends on backend/version.

    We treat it as best-effort:
    - prefer the first list-like element as "rows"
    """

    if isinstance(result, tuple) and len(result) == 2:
        a, b = result
        if isinstance(a, list):
            return a
        if isinstance(b, list):
            return b
    if isinstance(result, list):
        return result
    return None


def _parse_single_bool(rows: list[Any] | None) -> bool:
    if not rows:
        return False
    first = rows[0]
    if isinstance(first, dict):
        if not first:
            return False
        return bool(next(iter(first.values())))
    if isinstance(first, (list, tuple)):
        if not first:
            return False
        return bool(first[0])
    return bool(first)


async def _try_acquire_lock() -> bool:
    if not Tortoise._inited:
        return False
    conn = Tortoise.get_connection("default")
    rows = _parse_execute_query_result(await conn.execute_query(f"SELECT pg_try_advisory_lock({_RETENTION_LOCK_KEY})"))
    return _parse_single_bool(rows)


async def _release_lock() -> None:
    if not Tortoise._inited:
        return
    conn = Tortoise.get_connection("default")
    try:
        await conn.execute_query(f"SELECT pg_advisory_unlock({_RETENTION_LOCK_KEY})")
    except (RuntimeError, TypeError, ValueError):
        return


async def analytics_audit_log_retention_cleanup(ctx: dict[str, Any]) -> None:
    """
    Scheduled job: delete expired audit log events in bounded batches.

    Safety goals:
    - never run if DB/analytics is disabled
    - avoid long transactions by batching
    - guard against multi-worker duplication via advisory lock
    """

    settings: Settings | None = ctx.get("settings")
    if settings is None:
        logger.warning("Retention cleanup skipped (missing settings)")
        return

    if not settings.database.enabled:
        logger.info("Retention cleanup skipped (database disabled)")
        return

    if not settings.analytics.enabled:
        logger.info("Retention cleanup skipped (analytics disabled)")
        return

    audit = settings.analytics.audit_log
    if not audit.retention_enabled:
        logger.info("Retention cleanup skipped (retention disabled)")
        return

    if not Tortoise._inited:
        logger.warning("Retention cleanup skipped (ORM not initialized)")
        return

    now = datetime.now(UTC)
    cutoff = now - timedelta(days=int(audit.retention_days))

    acquired = await _try_acquire_lock()
    if not acquired:
        logger.info("Retention cleanup skipped (lock not acquired)")
        return

    started = datetime.now(UTC)
    deleted_total = 0

    try:
        while deleted_total < int(audit.retention_max_delete_per_run):
            remaining = int(audit.retention_max_delete_per_run) - deleted_total
            batch_size = min(int(audit.retention_batch_size), remaining)
            if batch_size <= 0:
                break

            ids = (
                await AuditEvent
                .filter(occurred_at__lt=cutoff)
                .order_by("occurred_at")
                .limit(batch_size)
                .values_list("id", flat=True)
            )
            if not ids:
                break

            deleted = int(await AuditEvent.filter(id__in=list(ids)).delete())
            deleted_total += deleted

            logger.info(
                "Retention batch deleted",
                deleted=deleted,
                deleted_total=deleted_total,
                cutoff=cutoff.isoformat(),
                batch_size=batch_size,
            )

            # Defensive: if deletion does not progress, stop to avoid a busy loop.
            if deleted <= 0:
                break
    finally:
        await _release_lock()

    elapsed_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
    logger.info(
        "Retention cleanup completed",
        deleted_total=deleted_total,
        cutoff=cutoff.isoformat(),
        elapsed_ms=elapsed_ms,
    )
