from __future__ import annotations

from collections.abc import Callable
from enum import StrEnum
from typing import Any

from src.core.logging import get_logger

logger = get_logger(__name__)


class PluginLifecyclePhase(StrEnum):
    DISCOVER = "discover"
    LOAD = "load"
    REGISTER = "register"
    BOOTSTRAP = "bootstrap"
    READY = "ready"
    DESTROY = "destroy"


class PluginLifecycle:
    """Orchestrates plugin lifecycle phases.

    Phases execute in order:
    1. discover — find plugins via entry points + directory scan
    2. load — import and instantiate plugins
    3. register — call arclayer_register on each plugin
    4. bootstrap — call arclayer_bootstrap after all registered
    5. ready — call arclayer_ready when app is ready
    6. destroy — call arclayer_destroy on shutdown
    """

    def __init__(self) -> None:
        self._phase: PluginLifecyclePhase = PluginLifecyclePhase.DISCOVER

    @property
    def current_phase(self) -> PluginLifecyclePhase:
        return self._phase

    async def transition(
        self,
        to_phase: PluginLifecyclePhase,
        *,
        plugin_manager: Any,
        app: Any = None,
        loader: Callable[[], list[tuple[str, object]]] | None = None,
    ) -> None:
        from src.core.plugin.manager import PluginManager

        pm: PluginManager = plugin_manager

        if to_phase == PluginLifecyclePhase.LOAD:
            await pm.load_plugins(loader=loader)
        elif to_phase == PluginLifecyclePhase.REGISTER:
            await pm.run_register(app)
        elif to_phase == PluginLifecyclePhase.BOOTSTRAP:
            await pm.run_bootstrap(app)
        elif to_phase == PluginLifecyclePhase.READY:
            await pm.run_ready(app)
        elif to_phase == PluginLifecyclePhase.DESTROY:
            await pm.run_destroy()

        self._phase = to_phase
        logger.info("Plugin lifecycle phase transitioned", phase=str(to_phase))
