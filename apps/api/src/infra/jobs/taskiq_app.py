from __future__ import annotations

import asyncio

from taskiq import TaskiqEvents, TaskiqState
from taskiq.schedule_sources import LabelScheduleSource
from taskiq.scheduler.scheduler import TaskiqScheduler
from taskiq_redis import RedisStreamBroker

from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.src.core.logging import configure_logging, get_logger

logger = get_logger(__name__)
_FATAL_TASKIQ_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_TASKIQ_ERRORS):
        raise exc


def _build_broker() -> RedisStreamBroker:
    settings = get_settings()
    dsn = settings.taskiq.redis_dsn or settings.valkey.dsn
    return RedisStreamBroker(url=dsn, queue_name=str(settings.taskiq.queue_name or "celestial:taskiq"))


broker = _build_broker()
scheduler = TaskiqScheduler(broker=broker, sources=[LabelScheduleSource(broker)])


@broker.on_event(TaskiqEvents.WORKER_STARTUP)
async def _worker_startup(state: TaskiqState) -> None:
    settings = get_settings()
    configure_logging(settings)
    state["settings"] = settings

    if not settings.taskiq.enabled:
        logger.warning("Taskiq worker started while TASKIQ__ENABLED is false")

    # Initialize ORM so jobs can use Tortoise models.
    await init_orm(settings)
    await verify_db_ready(settings)
    logger.info("Taskiq worker startup completed")


@broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
async def _worker_shutdown(_: TaskiqState) -> None:
    await close_orm()
    logger.info("Taskiq worker shutdown completed")
