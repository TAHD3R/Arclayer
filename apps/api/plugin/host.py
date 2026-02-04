from __future__ import annotations

from typing import Any

import pluggy

from apps.api.plugin.core_impl import CoreHookImpl
from apps.api.plugin.event_bus import EventBus
from apps.api.plugin.hooks import PROJECT_NAME, CelestialHooks


class PluginHost:
    """
    Global plugin host.

    This replaces the legacy ExtensionRegistry and provides:
    - pluggy PluginManager (hooks)
    - in-process EventBus (pub/sub)
    """

    def __init__(self) -> None:
        self._pm = pluggy.PluginManager(PROJECT_NAME)
        self._pm.add_hookspecs(CelestialHooks)
        self._event_bus = EventBus()
        # Register core contributions as a pluggy plugin.
        self._pm.register(CoreHookImpl(), name="core")

    @property
    def pm(self) -> pluggy.PluginManager:
        return self._pm

    @property
    def hook(self) -> Any:
        return self._pm.hook

    @property
    def event_bus(self) -> EventBus:
        return self._event_bus

    def register(self, plugin: Any, *, name: str) -> None:
        self._pm.register(plugin, name=name)

    def unregister(self, *, name: str) -> Any | None:
        """
        Unregister a previously registered plugin by name.

        Returns the unregistered plugin object if found.
        """

        return self._pm.unregister(name=name)

    def reset(self) -> None:
        """
        Reset the host state.

        Notes:
        - Intended for tests. This clears all non-core plugins and re-adds hookspecs.
        - EventBus is recreated to avoid leaked subscriptions across test runs.
        """

        self._pm = pluggy.PluginManager(PROJECT_NAME)
        self._pm.add_hookspecs(CelestialHooks)
        self._event_bus = EventBus()
        self._pm.register(CoreHookImpl(), name="core")


host = PluginHost()
