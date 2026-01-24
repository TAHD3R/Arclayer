from __future__ import annotations

from admin_menu.provider import AdminMenuProviderImpl
from apps.api.core.logging import get_logger
from apps.api.plugin.extension_points.admin_menu import ADMIN_MENU_PROVIDER_EXTENSION_POINT
from apps.api.plugin.registry import registry
from apps.api.plugin.types import BasePlugin

logger = get_logger(__name__)


class AdminMenuPlugin(BasePlugin):
    async def on_start(self) -> None:
        registry.register_extension(self.plugin_id, ADMIN_MENU_PROVIDER_EXTENSION_POINT, AdminMenuProviderImpl())
        logger.info("Admin menu plugin started", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        registry.unregister_extensions(self.plugin_id, ADMIN_MENU_PROVIDER_EXTENSION_POINT)
        logger.info("Admin menu plugin stopped", plugin_id=self.plugin_id)
