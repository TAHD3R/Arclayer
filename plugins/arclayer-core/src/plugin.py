"""Arclayer Core Extension — reference implementation and built-in services.

Replaces the previous CorePlugin pluggy stub.  Demonstrates the Extension
contract: manifest → process lifecycle → tenant-aware registration.
"""

from __future__ import annotations

from typing import Any

from src.core.logging import get_logger
from src.core.registries import PluginRegistry

logger = get_logger(__name__)

# Built-in content type registered by the core extension.
_BUILT_IN_CONTENT_TYPES: list[dict[str, Any]] = [
    {
        "key": "user-profile",
        "name": "User Profile",
        "description": "Default user profile content type for workspace members.",
        "fields": [],
    },
]


class HealthService:
    """Basic health-check service registered by the core extension."""

    async def check(self) -> dict[str, Any]:
        return {"status": "ok", "service": "arclayer-core"}


class SystemInfoService:
    """System information service."""

    async def info(self) -> dict[str, Any]:
        return {
            "extension": "arclayer-core",
            "version": "1.0.0",
        }


class CoreExtension:
    """The Arclayer Core Extension plugin.

    Implements the pluggy hook contract for backward compatibility with the
    existing PluginManager during the transition period.
    """

    name = "arclayer-core"

    def __init__(self) -> None:
        self._health_service = HealthService()
        self._system_info_service = SystemInfoService()

    # ——— pluggy hook contract (backward compat) ————————————————————————

    def arclayer_register(self, registry: PluginRegistry) -> None:
        registry.services.register("health", self._health_service)
        registry.services.register("system-info", self._system_info_service)
        for ct in _BUILT_IN_CONTENT_TYPES:
            registry.content_types.register(ct["key"], ct)
        logger.info(
            "Core extension registered services and content types",
            services=["health", "system-info"],
            content_types=[ct["key"] for ct in _BUILT_IN_CONTENT_TYPES],
        )

    def arclayer_bootstrap(self, app: object) -> None:
        logger.info("Core extension bootstrapped")

    def arclayer_ready(self, app: object) -> None:
        logger.info("Core extension ready")

    def arclayer_destroy(self) -> None:
        logger.info("Core extension destroyed")


def create_plugin() -> CoreExtension:
    """Factory function called by the Extension loader.

    This is the standard entry point for directory-scanned plugins.
    """
    return CoreExtension()
