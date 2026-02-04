from __future__ import annotations

from typing import Any

from arq import cron
from arq.connections import RedisSettings

from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.core.logging import configure_logging, get_logger
from apps.api.infra.jobs.analytics_retention import analytics_audit_log_retention_cleanup

logger = get_logger(__name__)


def _build_redis_settings() -> RedisSettings:
    settings = get_settings()
    dsn = settings.arq.redis_dsn or settings.valkey.dsn
    return RedisSettings.from_dsn(dsn)


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    configure_logging(settings)
    ctx["settings"] = settings

    if not settings.arq.enabled:
        logger.warning("arq worker started while ARQ__ENABLED is false")

    # Initialize ORM so maintenance jobs can use Tortoise models.
    await init_orm(settings)
    await verify_db_ready(settings)
    logger.info("arq worker startup completed")


async def shutdown(ctx: dict[str, Any]) -> None:
    await close_orm()
    logger.info("arq worker shutdown completed")


class WorkerSettings:
    """
    arq worker entrypoint.

    Run:
      uv run arq apps.api.infra.jobs.worker.WorkerSettings
    """

    redis_settings = _build_redis_settings()
    queue_name = get_settings().arq.queue_name

    functions = [
        analytics_audit_log_retention_cleanup,
    ]

    cron_jobs = [
        # Daily retention cleanup (UTC).
        cron(
            analytics_audit_log_retention_cleanup,
            hour={3},
            minute={30},
            second={0},
            unique=True,
        ),
    ]

    on_startup = startup
    on_shutdown = shutdown
