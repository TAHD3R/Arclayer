from __future__ import annotations

import asyncio
import inspect
from typing import Any

from arq import cron
from arq.connections import RedisSettings
from arq.cron import CronJob
from arq.worker import func as arq_func
from tortoise.exceptions import OperationalError

from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.core.logging import configure_logging, get_logger
from apps.api.infra.jobs.analytics_retention import analytics_audit_log_retention_cleanup
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.plugin.manager import PluginManager, _load_plugin_class
from apps.api.plugin.types import PluginStatus

logger = get_logger(__name__)
_FATAL_WORKER_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)
PLUGIN_STATUS_LOOKUP_ERRORS = (OperationalError, RuntimeError, ValueError, TypeError)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_WORKER_ERRORS):
        raise exc


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
    #
    # Include plugin model modules so plugin jobs can access their own tables when enabled.
    extra_models: list[str] = []
    try:
        manager = PluginManager(settings)
        manager.discover()
        extra_models = manager.collect_model_modules()
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Plugin discovery failed for arq worker ORM init", error=str(exc))

    await init_orm(settings, extra_modules=extra_models)
    await verify_db_ready(settings)
    logger.info("arq worker startup completed")


async def shutdown(ctx: dict[str, Any]) -> None:
    await close_orm()
    logger.info("arq worker shutdown completed")


def _collect_plugin_jobs() -> tuple[list[Any], list[CronJob]]:
    """
    Collect Arq job functions and cron jobs from plugins.

    Notes:
    - Arq reads WorkerSettings from class attributes; this runs at import-time.
    - We don't require DB connectivity here; each job wrapper checks plugin status at runtime.
    """

    settings = get_settings()
    manager = PluginManager(settings)
    try:
        manager.discover()
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Plugin discovery failed for arq worker", error=str(exc))
        return ([], [])

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
            logger.warning("Plugin load failed for arq worker", plugin_id=desc.plugin_id, error=str(exc))
            continue

    async def _is_plugin_enabled(plugin_id: str) -> bool:
        try:
            rec = await PluginRecord.get_or_none(plugin_id=plugin_id)
            if rec is None:
                return False
            return rec.status != PluginStatus.DISABLED
        except PLUGIN_STATUS_LOOKUP_ERRORS:
            return False

    functions: list[Any] = []
    cron_jobs: list[CronJob] = []

    for inst in instances:
        plugin_id = getattr(getattr(inst, "descriptor", None), "plugin_id", None) or getattr(inst, "plugin_id", None)
        if not plugin_id:
            continue
        pid = str(plugin_id)

        # Functions
        try:
            maybe = getattr(inst, "arq_functions", None)
            declared_raw = maybe() if callable(maybe) else []
            declared = declared_raw if isinstance(declared_raw, list) else []
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Plugin arq_functions failed", plugin_id=pid, error=str(exc))
            declared = []
        for fn in declared or []:
            if fn is None or not callable(fn) or not inspect.iscoroutinefunction(fn):
                continue

            async def _wrapped(ctx: dict[str, Any], *args: Any, __fn=fn, __pid=pid, **kwargs: Any) -> Any:
                if not await _is_plugin_enabled(__pid):
                    return None
                return await __fn(ctx, *args, **kwargs)

            fn_name = f"plugin:{pid}:{getattr(fn, '__name__', 'job')}"
            functions.append(arq_func(_wrapped, name=fn_name))

        # Cron jobs
        try:
            maybe_cron = getattr(inst, "arq_cron_jobs", None)
            declared_crons_raw = maybe_cron() if callable(maybe_cron) else []
            declared_crons = declared_crons_raw if isinstance(declared_crons_raw, list) else []
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Plugin arq_cron_jobs failed", plugin_id=pid, error=str(exc))
            declared_crons = []
        for job in declared_crons or []:
            if not isinstance(job, CronJob):
                continue
            coro = job.coroutine
            if not inspect.iscoroutinefunction(coro):
                continue

            async def _cron_wrapped(ctx: dict[str, Any], *args: Any, __coro=coro, __pid=pid, **kwargs: Any) -> Any:
                if not await _is_plugin_enabled(__pid):
                    return None
                return await __coro(ctx, *args, **kwargs)

            cron_jobs.append(
                CronJob(
                    name=f"plugin:{pid}:{job.name}",
                    coroutine=_cron_wrapped,
                    month=job.month,
                    day=job.day,
                    weekday=job.weekday,
                    hour=job.hour,
                    minute=job.minute,
                    second=job.second,
                    microsecond=job.microsecond,
                    run_at_startup=job.run_at_startup,
                    unique=job.unique,
                    job_id=job.job_id,
                    timeout_s=job.timeout_s,
                    keep_result_s=job.keep_result_s,
                    keep_result_forever=job.keep_result_forever,
                    max_tries=job.max_tries,
                )
            )

    return (functions, cron_jobs)


_PLUGIN_FUNCTIONS, _PLUGIN_CRON_JOBS = _collect_plugin_jobs()


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
        *_PLUGIN_FUNCTIONS,
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
        *_PLUGIN_CRON_JOBS,
    ]

    on_startup = startup
    on_shutdown = shutdown
