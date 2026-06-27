from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Protocol, cast

from tortoise import Tortoise

from src.config import Settings
from src.core.logging import get_logger
from src.modules.ai.repository import AIConversationRepository
from src.settings.runtime import get_core_settings_value_cached

logger = get_logger(__name__)

# 64-bit Postgres advisory lock key (namespace: AI conversation retention).
_RETENTION_LOCK_KEY = 882_314_704_550_119_337
_RETENTION_BATCH_SIZE = 500
_RETENTION_MAX_DELETE_PER_RUN = 5_000


class ConversationRetentionRepository(Protocol):
    async def delete_older_than(self, *, cutoff: datetime, batch_size: int) -> int: ...


def _parse_execute_query_result(result: Any) -> list[Any] | None:
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


def _orm_initialized() -> bool:
    return bool(Tortoise._inited)


async def _try_acquire_lock() -> bool:
    if not _orm_initialized():
        return False
    conn = Tortoise.get_connection("default")
    rows = _parse_execute_query_result(await conn.execute_query(f"SELECT pg_try_advisory_lock({_RETENTION_LOCK_KEY})"))
    return _parse_single_bool(rows)


async def _release_lock() -> None:
    if not _orm_initialized():
        return
    conn = Tortoise.get_connection("default")
    try:
        await conn.execute_query(f"SELECT pg_advisory_unlock({_RETENTION_LOCK_KEY})")
    except (RuntimeError, TypeError, ValueError):
        return


def _conversation_retention_days(section: dict[str, object]) -> int:
    value = section.get("conversation_retention_days")
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise RuntimeError("ai_agents.conversation_retention_days must be a positive integer")
    return value


async def ai_conversation_retention_cleanup(ctx: dict[str, Any]) -> None:
    """
    Scheduled job: delete AI conversations whose last update is older than the configured retention window.

    The cleanup runs outside request paths, uses bounded batches, and takes an advisory lock so multiple
    worker processes do not concurrently delete the same retention window.
    """

    settings: Settings | None = ctx.get("settings")
    if settings is None:
        logger.warning("AI conversation retention cleanup skipped (missing settings)")
        return

    if not settings.database.enabled:
        logger.info("AI conversation retention cleanup skipped (database disabled)")
        return

    if not _orm_initialized():
        logger.warning("AI conversation retention cleanup skipped (ORM not initialized)")
        return

    core = await get_core_settings_value_cached(settings)
    agent_settings = core.get("ai_agents")
    retention_days = _conversation_retention_days(
        cast(dict[str, object], agent_settings) if isinstance(agent_settings, dict) else {}
    )
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)

    acquired = await _try_acquire_lock()
    if not acquired:
        logger.info("AI conversation retention cleanup skipped (lock not acquired)")
        return

    repository = ctx.get("conversation_repository")
    if repository is None:
        repository = AIConversationRepository()

    started = datetime.now(UTC)
    deleted_total = 0

    try:
        deleted_total = await _delete_expired_conversations(
            repository=repository,
            cutoff=cutoff,
        )
    finally:
        await _release_lock()

    elapsed_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
    logger.info(
        "AI conversation retention cleanup completed",
        deleted_total=deleted_total,
        cutoff=cutoff.isoformat(),
        retention_days=retention_days,
        elapsed_ms=elapsed_ms,
    )


async def _delete_expired_conversations(
    *,
    repository: ConversationRetentionRepository,
    cutoff: datetime,
) -> int:
    deleted_total = 0
    while deleted_total < _RETENTION_MAX_DELETE_PER_RUN:
        remaining = _RETENTION_MAX_DELETE_PER_RUN - deleted_total
        batch_size = min(_RETENTION_BATCH_SIZE, remaining)
        deleted = await repository.delete_older_than(cutoff=cutoff, batch_size=batch_size)
        deleted_total += deleted
        logger.info(
            "AI conversation retention batch deleted",
            deleted=deleted,
            deleted_total=deleted_total,
            cutoff=cutoff.isoformat(),
            batch_size=batch_size,
        )
        if deleted <= 0:
            break
    return deleted_total
