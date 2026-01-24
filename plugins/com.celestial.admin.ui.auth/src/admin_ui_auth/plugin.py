from __future__ import annotations

from admin_ui_auth.provider import DefaultAdminUIContextProvider
from apps.api.core.admin_ui import ADMIN_UI_CONTEXT_PROVIDER_EXTENSION_POINT
from apps.api.core.logging import get_logger
from apps.api.plugin.registry import registry
from apps.api.plugin.types import BasePlugin

logger = get_logger(__name__)


class AdminUIAuthPlugin(BasePlugin):
    async def on_start(self) -> None:
        registry.register_extension(
            self.plugin_id,
            ADMIN_UI_CONTEXT_PROVIDER_EXTENSION_POINT,
            DefaultAdminUIContextProvider(),
        )
        logger.info("Admin UI auth plugin started", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        registry.unregister_extensions(self.plugin_id, ADMIN_UI_CONTEXT_PROVIDER_EXTENSION_POINT)
        logger.info("Admin UI auth plugin stopped", plugin_id=self.plugin_id)
