from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict

from src.core.logging import get_logger
from src.core.plugin.lifecycle import PluginLifecycle, PluginLifecyclePhase
from src.core.plugin.loader import discover_plugins
from src.core.plugin.manager import PluginManager

logger = get_logger(__name__)


class PluginRuntime(BaseModel):
    """App-owned plugin startup state exposed through `app.state`."""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    manager: PluginManager
    lifecycle: PluginLifecycle
    project_root: Path

    @property
    def registry(self) -> Any:
        return self.manager.registry


def _default_project_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "pnpm-workspace.yaml").is_file() and (parent / "apps" / "api").is_dir():
            return parent
    raise RuntimeError("Unable to resolve Arclayer project root for plugin discovery")


async def init_plugin_runtime(app: FastAPI, *, project_root: Path | None = None) -> PluginRuntime:
    if getattr(app.state, "plugin_runtime", None) is not None:
        raise RuntimeError("Plugin runtime already initialized for this app")

    resolved_project_root = (project_root or _default_project_root()).resolve()
    plugin_manager = PluginManager()
    plugin_lifecycle = PluginLifecycle()

    await plugin_lifecycle.transition(
        PluginLifecyclePhase.LOAD,
        plugin_manager=plugin_manager,
        app=app,
        loader=lambda: discover_plugins(root_dir=resolved_project_root),
    )
    await plugin_lifecycle.transition(
        PluginLifecyclePhase.REGISTER,
        plugin_manager=plugin_manager,
        app=app,
    )
    await plugin_lifecycle.transition(
        PluginLifecyclePhase.BOOTSTRAP,
        plugin_manager=plugin_manager,
        app=app,
    )
    await plugin_lifecycle.transition(
        PluginLifecyclePhase.READY,
        plugin_manager=plugin_manager,
        app=app,
    )

    runtime = PluginRuntime(
        manager=plugin_manager,
        lifecycle=plugin_lifecycle,
        project_root=resolved_project_root,
    )
    app.state.plugin_runtime = runtime
    app.state.plugin_manager = plugin_manager
    app.state.plugin_lifecycle = plugin_lifecycle
    app.state.plugin_registry = plugin_manager.registry
    logger.info("Plugin runtime initialized", plugins=plugin_manager.plugin_names)
    return runtime


async def close_plugin_runtime(app: FastAPI) -> None:
    runtime: PluginRuntime | None = getattr(app.state, "plugin_runtime", None)
    if runtime is None:
        return
    try:
        await runtime.lifecycle.transition(
            PluginLifecyclePhase.DESTROY,
            plugin_manager=runtime.manager,
        )
    finally:
        app.state.plugin_runtime = None
        app.state.plugin_manager = None
        app.state.plugin_lifecycle = None
        app.state.plugin_registry = None
