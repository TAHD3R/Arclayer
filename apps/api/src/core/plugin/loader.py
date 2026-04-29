from __future__ import annotations

import importlib.metadata
import importlib.util
from pathlib import Path

from src.core.logging import get_logger

logger = get_logger(__name__)

_ENTRY_POINT_GROUP = "arclayer.plugins"
_DEFAULT_PLUGINS_DIR = "plugins"


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
            plugin = factory() if callable(factory) else factory
            plugins.append((ep.name, plugin))
            logger.info("Plugin discovered via entry point", name=ep.name, group=_ENTRY_POINT_GROUP)
        except Exception:
            logger.exception("Failed to load plugin entry point", name=ep.name)
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
                continue
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            factory = getattr(module, "create_plugin", None)
            if factory is None:
                continue
            plugin = factory() if callable(factory) else factory
            plugins.append((child.name, plugin))
            logger.info("Plugin discovered via directory scan", name=child.name)
        except Exception:
            logger.exception("Failed to load plugin from directory", name=child.name)
    return plugins


def discover_plugins(
    *,
    root_dir: str | Path | None = None,
    plugins_dir_name: str = _DEFAULT_PLUGINS_DIR,
) -> list[tuple[str, object]]:
    """Discover plugins from entry points and directory scanning."""
    plugins = discover_entry_point_plugins()
    plugins.extend(scan_directory_plugins(root_dir=root_dir, plugins_dir_name=plugins_dir_name))
    return plugins
