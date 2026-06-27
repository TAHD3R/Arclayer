from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol, cast
from uuid import UUID

from tortoise import Tortoise

from src.agents.checkpointing import build_agent_checkpointer_factory
from src.config import Settings
from src.core.logging import get_logger
from src.modules.projects.agents.repository import AgentRunRepository, ExpiredAgentRunCheckpoint
from src.settings.runtime import get_core_settings_value_cached

logger = get_logger(__name__)

# 64-bit Postgres advisory lock key (namespace: AI Agent checkpoint retention).
_RETENTION_LOCK_KEY = 882_314_704_550_119_338
_RETENTION_BATCH_SIZE = 500
_RETENTION_MAX_DELETE_PER_RUN = 5_000


class AgentCheckpointRetentionRepository(Protocol):
    async def list_expired_terminal_checkpoints(
        self,
        *,
        cutoff: datetime,
        batch_size: int,
    ) -> list[ExpiredAgentRunCheckpoint]: ...

    async def delete_runs(self, *, run_ids: list[UUID]) -> int: ...


class AgentCheckpointSaver(Protocol):
    async def adelete_thread(self, thread_id: str) -> None: ...


class AgentCheckpointFactory(Protocol):
    def __call__(self) -> AbstractAsyncContextManager[AgentCheckpointSaver]: ...


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


def _bool_setting(section: dict[str, object], key: str, default: bool) -> bool:
    value = section.get(key)
    return value if isinstance(value, bool) else default


def _str_setting(section: dict[str, object], key: str, default: str) -> str:
    value = section.get(key)
    return value.strip() if isinstance(value, str) and value.strip() else default


def _checkpoint_ttl_days(section: dict[str, object]) -> int:
    value = section.get("checkpoint_ttl_days")
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise RuntimeError("langgraph.checkpoint_ttl_days must be a positive integer")
    return value


async def ai_agent_checkpoint_retention_cleanup(ctx: dict[str, Any]) -> None:
    """
    Scheduled job: delete expired LangGraph checkpoints and their terminal Agent run snapshots.

    Only terminal runs are pruned. Running runs are left intact even if old, because they may still be inspected,
    cancelled, or diagnosed separately.
    """

    settings: Settings | None = ctx.get("settings")
    if settings is None:
        logger.warning("AI Agent checkpoint retention cleanup skipped (missing settings)")
        return

    if not settings.database.enabled:
        logger.info("AI Agent checkpoint retention cleanup skipped (database disabled)")
        return

    if not _orm_initialized():
        logger.warning("AI Agent checkpoint retention cleanup skipped (ORM not initialized)")
        return

    langgraph_settings = await _langgraph_settings(settings)
    if not _bool_setting(langgraph_settings, "enabled", True):
        logger.info("AI Agent checkpoint retention cleanup skipped (LangGraph disabled)")
        return

    ttl_days = _checkpoint_ttl_days(langgraph_settings)
    cutoff = datetime.now(UTC) - timedelta(days=ttl_days)
    checkpointer = _str_setting(langgraph_settings, "checkpointer", "database")

    acquired = await _try_acquire_lock()
    if not acquired:
        logger.info("AI Agent checkpoint retention cleanup skipped (lock not acquired)")
        return

    repository = ctx.get("agent_run_repository")
    if repository is None:
        repository = AgentRunRepository()
    checkpointer_factory = ctx.get("checkpointer_factory")
    if checkpointer_factory is None:
        checkpointer_factory = build_agent_checkpointer_factory(settings=settings, checkpointer=checkpointer)

    started = datetime.now(UTC)
    deleted_total = 0

    try:
        deleted_total = await _delete_expired_agent_checkpoints(
            repository=cast(AgentCheckpointRetentionRepository, repository),
            checkpointer_factory=cast(AgentCheckpointFactory, checkpointer_factory),
            cutoff=cutoff,
        )
    finally:
        await _release_lock()

    elapsed_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
    logger.info(
        "AI Agent checkpoint retention cleanup completed",
        deleted_total=deleted_total,
        cutoff=cutoff.isoformat(),
        ttl_days=ttl_days,
        elapsed_ms=elapsed_ms,
    )


async def _langgraph_settings(settings: Settings) -> dict[str, object]:
    core = await get_core_settings_value_cached(settings)
    section = core.get("langgraph")
    return cast(dict[str, object], section) if isinstance(section, dict) else {}


async def _delete_expired_agent_checkpoints(
    *,
    repository: AgentCheckpointRetentionRepository,
    checkpointer_factory: AgentCheckpointFactory,
    cutoff: datetime,
) -> int:
    deleted_total = 0
    async with checkpointer_factory() as checkpointer:
        while deleted_total < _RETENTION_MAX_DELETE_PER_RUN:
            remaining = _RETENTION_MAX_DELETE_PER_RUN - deleted_total
            batch_size = min(_RETENTION_BATCH_SIZE, remaining)
            expired = await repository.list_expired_terminal_checkpoints(cutoff=cutoff, batch_size=batch_size)
            if not expired:
                break

            for target in expired:
                await checkpointer.adelete_thread(target.thread_id)
            deleted = await repository.delete_runs(run_ids=[target.run_id for target in expired])
            deleted_total += deleted

            logger.info(
                "AI Agent checkpoint retention batch deleted",
                deleted=deleted,
                deleted_total=deleted_total,
                cutoff=cutoff.isoformat(),
                batch_size=batch_size,
            )

            if deleted <= 0:
                break
    return deleted_total
