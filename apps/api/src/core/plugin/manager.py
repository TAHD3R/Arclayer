from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pluggy import PluginManager as _PluggyPluginManager

from src.core.logging import get_logger
from src.core.plugin.specs import ArclayerSpec

logger = get_logger(__name__)


class PluginManager:
    """Wraps pluggy's PluginManager with Arclayer-specific lifecycle.

    Manages plugin registration and lifecycle phase transitions:
    discover → load → register → bootstrap → ready → destroy.
    """

    def __init__(self) -> None:
        self._pm = _PluggyPluginManager("arclayer")
        self._pm.add_hookspecs(ArclayerSpec)
        self._plugin_names: list[str] = []
        self._registry: Any = None
        self._loaded = False

    @property
    def plugin_names(self) -> tuple[str, ...]:
        return tuple(self._plugin_names)

    def register(self, plugin: object, *, name: str | None = None) -> None:
        plugin_name = name or getattr(plugin, "__name__", type(plugin).__name__)
        self._pm.register(plugin, name=plugin_name)
        self._plugin_names.append(plugin_name)
        logger.info("Plugin registered", plugin=plugin_name)

    def set_registry(self, registry: Any) -> None:
        self._registry = registry

    async def load_plugins(
        self,
        *,
        loader: Callable[[], list[tuple[str, object]]] | None = None,
    ) -> None:
        if self._loaded:
            return
        if loader is not None:
            for name, plugin in loader():
                self.register(plugin, name=name)
        self._loaded = True

    async def run_register(self, app: Any) -> None:
        if self._registry is None:
            from src.core.registries import (
                ComponentRegistry,
                ContentTypeRegistry,
                ControllerRegistry,
                CustomFieldRegistry,
                MiddlewareRegistry,
                PluginRegistry,
                PolicyRegistry,
                ProviderRegistry,
                SanitizerRegistry,
                ServiceRegistry,
                ValidatorRegistry,
            )

            self._registry = PluginRegistry(
                services=ServiceRegistry(),
                controllers=ControllerRegistry(),
                content_types=ContentTypeRegistry(),
                middlewares=MiddlewareRegistry(),
                policies=PolicyRegistry(),
                custom_fields=CustomFieldRegistry(),
                providers=ProviderRegistry(),
                components=ComponentRegistry(),
                validators=ValidatorRegistry(),
                sanitizers=SanitizerRegistry(),
            )
        self._pm.hook.arclayer_register(registry=self._registry)
        logger.info("Plugin register phase complete", count=len(self._plugin_names))

    async def run_bootstrap(self, app: Any) -> None:
        self._pm.hook.arclayer_bootstrap(app=app)
        logger.info("Plugin bootstrap phase complete")

    async def run_ready(self, app: Any) -> None:
        self._pm.hook.arclayer_ready(app=app)
        logger.info("Plugin ready phase complete")

    async def run_destroy(self) -> None:
        self._pm.hook.arclayer_destroy()
        logger.info("Plugin destroy phase complete")

    @property
    def registry(self) -> Any:
        return self._registry
