from __future__ import annotations

import asyncio
import inspect
from typing import Any

from taskiq import TaskiqEvents, TaskiqState
from taskiq.schedule_sources import LabelScheduleSource
from taskiq.scheduler.scheduler import TaskiqScheduler
from taskiq_redis import RedisStreamBroker
from tortoise.exceptions import OperationalError

from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.core.logging import configure_logging, get_logger
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.plugin.manager import PluginManager, _load_plugin_class
from apps.api.plugin.types import PluginStatus

logger = get_logger(__name__)
_FATAL_TASKIQ_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)
PLUGIN_STATUS_LOOKUP_ERRORS = (OperationalError, RuntimeError, ValueError, TypeError)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_TASKIQ_ERRORS):
        raise exc


def _build_broker() -> RedisStreamBroker:
    settings = get_settings()
    dsn = settings.taskiq.redis_dsn or settings.valkey.dsn
    return RedisStreamBroker(url=dsn, queue_name=str(settings.taskiq.queue_name or "celestial:taskiq"))


broker = _build_broker()
scheduler = TaskiqScheduler(broker=broker, sources=[LabelScheduleSource(broker)])


async def _is_plugin_enabled(plugin_id: str) -> bool:
    try:
        rec = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if rec is None:
            return False
        return rec.status != PluginStatus.DISABLED
    except PLUGIN_STATUS_LOOKUP_ERRORS:
        return False


def _register_plugin_tasks() -> None:
    """
    Register plugin-provided tasks into the broker.

    Notes:
    - Keep it best-effort: a broken plugin should not prevent core jobs from running.
    """

    settings = get_settings()
    manager = PluginManager(settings)
    try:
        manager.discover()
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Plugin discovery failed for Taskiq registration", error=str(exc))
        return

    instances: list[Any] = []
    for desc in manager.descriptors.values():
        try:
            plugin_class = _load_plugin_class(desc.entrypoint)
            instance = plugin_class(desc, manager.host)
            manager.host.register(instance, name=desc.plugin_id)
            instance.on_load()
            instances.append(instance)
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Plugin load failed for Taskiq registration", plugin_id=desc.plugin_id, error=str(exc))
            continue

    for inst in instances:
        plugin_id = getattr(getattr(inst, "descriptor", None), "plugin_id", None) or getattr(inst, "plugin_id", None)
        if not plugin_id:
            continue
        pid = str(plugin_id)

        try:
            maybe = getattr(inst, "taskiq_tasks", None)
            declared_raw = maybe() if callable(maybe) else []
            declared = declared_raw if isinstance(declared_raw, list) else []
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Plugin taskiq_tasks failed", plugin_id=pid, error=str(exc))
            declared = []

        for fn in declared or []:
            if fn is None or not callable(fn) or not inspect.iscoroutinefunction(fn):
                continue

            async def _wrapped(*args: Any, __fn=fn, __pid=pid, **kwargs: Any) -> Any:
                if not await _is_plugin_enabled(__pid):
                    return None
                return await __fn(*args, **kwargs)

            fn_name = getattr(fn, "__name__", "task")
            broker.task(task_name=f"plugin:{pid}:{fn_name}")(_wrapped)


@broker.on_event(TaskiqEvents.WORKER_STARTUP)
async def _worker_startup(state: TaskiqState) -> None:
    settings = get_settings()
    configure_logging(settings)
    state.state["settings"] = settings

    if not settings.taskiq.enabled:
        logger.warning("Taskiq worker started while TASKIQ__ENABLED is false")

    # Initialize ORM so jobs can use Tortoise models.
    #
    # Include plugin model modules so plugin jobs can access their own tables when enabled.
    extra_models: list[str] = []
    try:
        manager = PluginManager(settings)
        manager.discover()
        extra_models = manager.collect_model_modules()
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Plugin discovery failed for Taskiq ORM init", error=str(exc))

    await init_orm(settings, extra_modules=extra_models)
    await verify_db_ready(settings)
    if settings.plugin.enabled:
        try:
            _register_plugin_tasks()
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Plugin taskiq_tasks registration failed", error=str(exc))
    logger.info("Taskiq worker startup completed")


@broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
async def _worker_shutdown(_: TaskiqState) -> None:
    await close_orm()
    logger.info("Taskiq worker shutdown completed")
