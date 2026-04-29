from __future__ import annotations

from typing import Any

from pluggy import HookspecMarker

arclayer_hookspec = HookspecMarker("arclayer")


class ArclayerSpec:
    """Hook specification for the Arclayer plugin system.

    Plugins implement these hooks to register resources during the
    application lifecycle. Hooks are called in order: register →
    bootstrap → ready, and destroy on shutdown.
    """

    @arclayer_hookspec
    def arclayer_register(self, registry: Any) -> None:
        """Called when a plugin should register its resources.

        Plugins register services, controllers, content types, policies,
        middlewares, custom fields, and providers through the registry.
        """

    @arclayer_hookspec
    def arclayer_bootstrap(self, app: Any) -> None:
        """Called after all plugins have registered.

        Plugins perform initialization that depends on other plugins'
        registered resources.
        """

    @arclayer_hookspec
    def arclayer_ready(self, app: Any) -> None:
        """Called when the application is ready to serve requests."""

    @arclayer_hookspec
    def arclayer_destroy(self) -> None:
        """Called on application shutdown for cleanup."""
