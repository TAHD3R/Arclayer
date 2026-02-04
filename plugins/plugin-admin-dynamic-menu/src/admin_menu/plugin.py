from __future__ import annotations

from apps.api.core.logging import get_logger
from apps.api.plugin.types import BasePlugin

logger = get_logger(__name__)


class AdminMenuPlugin(BasePlugin):
    async def on_start(self) -> None:
        # Legacy plugin kept for reference. Core admin menu is now built-in.
        logger.info("Admin menu plugin started (no-op)", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        logger.info("Admin menu plugin stopped (no-op)", plugin_id=self.plugin_id)
