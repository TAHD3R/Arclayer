from __future__ import annotations

import inspect
from typing import cast

from arq.connections import ArqRedis, RedisSettings, create_pool
from fastapi import FastAPI

from apps.api.config import Settings
from apps.api.core.logging import get_logger

logger = get_logger(__name__)


async def init_arq_client(app: FastAPI, settings: Settings) -> None:
    """
    Initialize an arq producer pool for the API process.

    Notes:
    - This is separate from the arq worker process.
    - The API uses it to enqueue background jobs (e.g. asset thumbnail generation).
    - Best-effort: if disabled/misconfigured, callers should fall back safely.
    """

    if not settings.arq.enabled:
        return

    dsn = settings.arq.redis_dsn or settings.valkey.dsn
    if not dsn:
        logger.warning("ARQ enabled but redis dsn is missing", action="init_arq_client_missing_dsn")
        return

    try:
        pool = await create_pool(
            RedisSettings.from_dsn(dsn),
            default_queue_name=str(settings.arq.queue_name or "celestial:arq"),
        )
    except Exception as exc:
        logger.warning("ARQ client init failed", action="init_arq_client_failed", error=str(exc))
        return

    app.state.arq = pool
    logger.info("ARQ client initialized", action="init_arq_client_ok", queue_name=str(settings.arq.queue_name))


async def close_arq_client(app: FastAPI) -> None:
    pool: ArqRedis | None = getattr(app.state, "arq", None)
    if pool is None:
        return
    try:
        maybe = pool.close()
        if inspect.isawaitable(maybe):
            await maybe
    except Exception as exc:
        logger.warning("ARQ client close failed", action="close_arq_client_failed", error=str(exc))
    finally:
        try:
            delattr(app.state, "arq")
        except Exception:
            pass


def get_arq_client(app: FastAPI) -> ArqRedis | None:
    return cast(ArqRedis | None, getattr(app.state, "arq", None))
