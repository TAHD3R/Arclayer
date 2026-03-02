from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from apps.api.config import Settings
from apps.api.core.logging import get_logger
from apps.api.infra.cache.valkey import ValkeyClient

logger = get_logger(__name__)


async def init_taskiq_client(app: FastAPI, settings: Settings) -> None:
    """
    Initialize Taskiq client state for the API process.

    Notes:
    - The API enqueues background jobs (e.g. asset thumbnail generation) via Taskiq tasks.
    - Taskiq does not require a persistent producer pool, but we keep a small state flag
      to standardize best-effort enqueue behavior.
    """

    if not settings.taskiq.enabled:
        app.state.taskiq_enabled = False
        return

    app.state.taskiq_enabled = True
    logger.info("Taskiq client enabled", action="init_taskiq_client_ok", queue_name=str(settings.taskiq.queue_name))


async def close_taskiq_client(app: FastAPI) -> None:
    app.state.taskiq_enabled = False


def is_taskiq_enabled(app: FastAPI) -> bool:
    return bool(getattr(app.state, "taskiq_enabled", False))


async def try_dedupe_enqueue(
    app: FastAPI,
    *,
    dedupe_key: str,
    ttl_seconds: int,
) -> bool:
    """
    Best-effort dedupe for enqueueing tasks.

    Returns:
    - True: the caller should proceed as "enqueued" (either acquired the dedupe lock, or dedupe is unavailable)
    - False: another enqueue already happened recently (skip)
    """

    if ttl_seconds <= 0:
        return True

    valkey: ValkeyClient | None = getattr(app.state, "valkey", None)
    if valkey is None:
        return True

    try:
        # Single-writer best-effort: if another API replica already enqueued the job,
        # avoid duplicating work. Worker side still enforces idempotency via DB advisory locks.
        ok = await valkey.set(dedupe_key, "1", ex=ttl_seconds, nx=True)
        return bool(ok)
    except BaseException as exc:
        logger.warning("Task enqueue dedupe failed", action="taskiq_enqueue_dedupe_failed", error=str(exc))
        return True


async def try_enqueue_task(task: Any, *args: Any, **kwargs: Any) -> bool:
    """
    Best-effort Taskiq enqueue helper.

    Returns:
    - True when the message was accepted for enqueue.
    - False when enqueue is unavailable/failed.
    """

    try:
        await task.kiq(*args, **kwargs)
        return True
    except BaseException as exc:
        logger.warning("Taskiq enqueue failed", action="taskiq_enqueue_failed", error=str(exc))
        return False
