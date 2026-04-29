from __future__ import annotations

import importlib.metadata
import importlib.util
from pathlib import Path
from typing import Any

from src.core.logging import get_logger
from src.core.plugin.internal import discover_internal_plugins

logger = get_logger(__name__)

_ENTRY_POINT_GROUP = "arclayer.plugins"
_DEFAULT_PLUGINS_DIR = "plugins"


class PluginLoadError(RuntimeError):
    """Raised when a configured plugin cannot be loaded during startup."""


def _plugin_load_error(*, source: str, name: str, message: str) -> PluginLoadError:
    return PluginLoadError(f"Failed to load {source} plugin '{name}': {message}")


def _instantiate_plugin(*, source: str, name: str, factory_or_plugin: Any) -> object:
    try:
        return factory_or_plugin() if callable(factory_or_plugin) else factory_or_plugin
    except Exception as exc:
        logger.exception("Plugin factory failed", source=source, name=name)
        raise _plugin_load_error(source=source, name=name, message=str(exc)) from exc


def discover_entry_point_plugins() -> list[tuple[str, object]]:
    """Discover plugins registered via importlib.metadata entry points.

    Plugins declare themselves in pyproject.toml:
        [project.entry-points."arclayer.plugins"]
        my-plugin = "my_plugin:create_plugin"
    """
    plugins: list[tuple[str, object]] = []
    try:
        entry_points = importlib.metadata.entry_points(group=_ENTRY_POINT_GROUP)
    except TypeError:
        # Python < 3.12 compat: entry_points() takes no args
        all_eps = importlib.metadata.entry_points()
        entry_points = all_eps.select(group=_ENTRY_POINT_GROUP) if hasattr(all_eps, "select") else []

    for ep in entry_points:
        try:
            factory = ep.load()
            plugin = _instantiate_plugin(source="entry point", name=ep.name, factory_or_plugin=factory)
            plugins.append((ep.name, plugin))
            logger.info("Plugin discovered via entry point", name=ep.name, group=_ENTRY_POINT_GROUP)
        except PluginLoadError:
            raise
        except Exception as exc:
            logger.exception("Failed to load plugin entry point", name=ep.name)
            raise _plugin_load_error(source="entry point", name=ep.name, message=str(exc)) from exc
    return plugins


def scan_directory_plugins(
    *,
    root_dir: str | Path | None = None,
    plugins_dir_name: str = _DEFAULT_PLUGINS_DIR,
) -> list[tuple[str, object]]:
    """Scan a plugins/ directory for plugin modules following directory conventions.

    Each subdirectory of plugins/ is treated as a plugin if it contains
    an __init__.py with a create_plugin() factory function.
    """
    if root_dir is None:
        return []

    plugins_root = Path(root_dir) / plugins_dir_name
    if not plugins_root.is_dir():
        return []

    plugins: list[tuple[str, object]] = []
    for child in sorted(plugins_root.iterdir()):
        if not child.is_dir() or child.name.startswith("_") or child.name.startswith("."):
            continue
        init_file = child / "__init__.py"
        if not init_file.is_file():
            continue
        try:
            spec = importlib.util.spec_from_file_location(
                f"plugins.{child.name}",
                str(init_file),
            )
            if spec is None or spec.loader is None:
                raise _plugin_load_error(source="directory", name=child.name, message="module spec is unavailable")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            factory = getattr(module, "create_plugin", None)
            if factory is None:
                raise _plugin_load_error(source="directory", name=child.name, message="create_plugin is missing")
            plugin = _instantiate_plugin(source="directory", name=child.name, factory_or_plugin=factory)
            plugins.append((child.name, plugin))
            logger.info("Plugin discovered via directory scan", name=child.name)
        except PluginLoadError:
            raise
        except Exception as exc:
            logger.exception("Failed to load plugin from directory", name=child.name)
            raise _plugin_load_error(source="directory", name=child.name, message=str(exc)) from exc
    return plugins


def discover_plugins(
    *,
    root_dir: str | Path | None = None,
    plugins_dir_name: str = _DEFAULT_PLUGINS_DIR,
    include_internal: bool = True,
) -> list[tuple[str, object]]:
    """Discover plugins from entry points and directory scanning."""
    plugins = discover_internal_plugins() if include_internal else []
    plugins.extend(discover_entry_point_plugins())
    plugins.extend(scan_directory_plugins(root_dir=root_dir, plugins_dir_name=plugins_dir_name))
    return plugins
