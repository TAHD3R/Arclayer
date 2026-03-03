from __future__ import annotations

import asyncio
import os
import random
import signal
from datetime import UTC, datetime

from fastapi import FastAPI

from apps.api.src.common.constants.plugin import RESTART_EPOCH_KEY, RESTART_INFO_KEY
from apps.api.src.config import Settings
from apps.api.src.core.logging import get_logger
from apps.api.src.infra.cache.valkey import ValkeyClient

logger = get_logger(__name__)
_FATAL_RESTART_WATCHER_ERRORS: tuple[type[BaseException], ...] = (
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_RESTART_WATCHER_ERRORS):
        raise exc


def _parse_epoch(value: str | bytes | None) -> int:
    if value is None:
        return 0
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")
    try:
        return int(value)
    except ValueError:
        return 0


async def request_restart(
    valkey: ValkeyClient,
    *,
    plugin_id: str | None,
    reason: str,
    info_ttl: int = 3600,
) -> int:
    epoch = await valkey.incr(RESTART_EPOCH_KEY)
    payload = {
        "epoch": epoch,
        "plugin_id": plugin_id,
        "reason": reason,
        "requested_at": datetime.now(UTC).isoformat(),
    }
    await valkey.set_json(RESTART_INFO_KEY, payload, ex=info_ttl)
    return epoch


async def start_restart_watcher(app: FastAPI, settings: Settings) -> asyncio.Task | None:
    if not settings.plugin.auto_restart:
        logger.info("Plugin restart watcher skipped (disabled)")
        return None

    valkey: ValkeyClient | None = getattr(app.state, "valkey", None)
    if valkey is None:
        logger.warning("Plugin restart watcher skipped (valkey not ready)")
        return None

    task = asyncio.create_task(_restart_watch_loop(app, settings, valkey))
    app.state.plugin_restart_task = task
    return task


async def stop_restart_watcher(app: FastAPI) -> None:
    task: asyncio.Task | None = getattr(app.state, "plugin_restart_task", None)
    if task is None:
        return
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)


async def _restart_watch_loop(app: FastAPI, settings: Settings, valkey: ValkeyClient) -> None:
    poll_interval = settings.plugin.restart_poll_interval_seconds
    jitter_seconds = settings.plugin.restart_jitter_seconds

    current = _parse_epoch(await valkey.get(RESTART_EPOCH_KEY))
    logger.info("Plugin restart watcher started", epoch=current)

    while True:
        try:
            await asyncio.sleep(poll_interval)
            epoch = _parse_epoch(await valkey.get(RESTART_EPOCH_KEY))
            if epoch <= current:
                continue
            current = epoch
            delay = random.uniform(0, max(jitter_seconds, 0))
            logger.warning("Plugin restart requested", epoch=epoch, delay_seconds=delay)
            if delay:
                await asyncio.sleep(delay)
            os.kill(os.getpid(), signal.SIGTERM)
            return
        except asyncio.CancelledError:
            return
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Plugin restart watcher error", action="plugin_restart_watch_loop", error=str(exc))
