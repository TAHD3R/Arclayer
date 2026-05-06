from __future__ import annotations

from src.core.plugin.specs import arclayer_hookimpl
from src.core.registries import PluginRegistry


class CorePlugin:
    """Built-in core plugin that registers essential infrastructure.

    Demonstrates the pluggy plugin pattern: internal Arclayer services
    that register themselves via the standard plugin hook system.
    """

    @arclayer_hookimpl
    def arclayer_register(self, registry: PluginRegistry) -> None:
        """Register core services during the plugin register phase.

        Plugins receive the composite PluginRegistry and can populate
        any of the sub-registries: services, controllers, content_types,
        middlewares, policies, custom_fields, providers, etc.
        """
        # Future: register core services, default content types, etc.
        pass

    @arclayer_hookimpl
    def arclayer_bootstrap(self, app: object) -> None:
        pass

    @arclayer_hookimpl
    def arclayer_destroy(self) -> None:
        pass


def discover_internal_plugins() -> list[tuple[str, object]]:
    """Return built-in plugins that always participate in app startup."""

    return [("arclayer-core", CorePlugin())]
