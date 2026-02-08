from __future__ import annotations

import asyncio
import time
from pathlib import Path

from fastapi import FastAPI
from watchfiles import awatch

from apps.api.config import Settings
from apps.api.core.i18n import clear_locale_cache
from apps.api.core.logging import get_logger
from apps.api.plugin.manager import PluginManager

logger = get_logger(__name__)
_FATAL_PLUGIN_WATCH_ERRORS: tuple[type[BaseException], ...] = (
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_PLUGIN_WATCH_ERRORS):
        raise exc


def _is_locale_json(path: Path) -> bool:
    parts = {p.lower() for p in path.parts}
    if "locales" not in parts:
        return False
    return path.suffix.lower() == ".json"


async def start_plugin_watchers(
    app: FastAPI, settings: Settings, *, plugin_manager: PluginManager
) -> asyncio.Task | None:
    """
    Start development-only file watchers.

    Behaviors:
    - locales/**/*.json change -> clear i18n cache (no restart)
    - plugins/** change -> request restart (valkey-based) for safe reload
    """

    if settings.app_env != "development":
        logger.info("watchfiles skipped (not development)", env=settings.app_env)
        return None
    if not settings.plugin.watch_enabled:
        logger.info("watchfiles skipped (disabled)")
        return None

    root = Path(settings.plugin.root_dir)
    repo_root = Path(__file__).resolve().parents[3]
    core_locales = repo_root / "locales"

    watch_paths: list[Path] = []
    if settings.plugin.watch_plugins:
        watch_paths.append(root)
    if settings.plugin.watch_locales:
        watch_paths.append(core_locales)
        watch_paths.append(root)  # plugin locales live under plugins/**/locales

    # Filter missing paths to avoid watchfiles errors.
    watch_paths = [p for p in watch_paths if p.exists()]
    if not watch_paths:
        logger.info("watchfiles skipped (no watch paths)")
        return None

    debounce_ms = max(int(settings.plugin.watch_debounce_ms), 0)

    task = asyncio.create_task(_watch_loop(watch_paths, plugin_manager=plugin_manager, debounce_ms=debounce_ms))
    app.state.plugin_watch_task = task
    logger.info("watchfiles started", paths=[str(p) for p in watch_paths], debounce_ms=debounce_ms)
    return task


async def stop_plugin_watchers(app: FastAPI) -> None:
    task: asyncio.Task | None = getattr(app.state, "plugin_watch_task", None)
    if task is None:
        return
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)


async def _watch_loop(paths: list[Path], *, plugin_manager: PluginManager, debounce_ms: int) -> None:
    last_restart_at = 0.0
    plugin_root = plugin_manager.root_dir.resolve()
    while True:
        try:
            async for changes in awatch(*paths):
                now = time.monotonic()
                changed_paths = [Path(p) for _change, p in changes]
                if not changed_paths:
                    continue

                # Locale changes: clear cache (fast, no restart needed).
                if any(_is_locale_json(p) for p in changed_paths):
                    clear_locale_cache()
                    logger.info("i18n cache cleared (watchfiles)")

                # Plugin code changes: request restart (safe for Python module reload).
                if any(Path(p).resolve().is_relative_to(plugin_root) for p in changed_paths):
                    if debounce_ms and (now - last_restart_at) * 1000 < debounce_ms:
                        continue
                    last_restart_at = now
                    await plugin_manager.request_restart(None, reason="watchfiles")
                    logger.warning("restart requested (watchfiles)")
        except asyncio.CancelledError:
            return
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("watchfiles loop error", action="plugin_watch_loop", error=str(exc))
            await asyncio.sleep(1.0)
