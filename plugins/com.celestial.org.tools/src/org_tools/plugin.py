from __future__ import annotations

from apps.api.core.logging import get_logger
from apps.api.plugin.types import BasePlugin

logger = get_logger(__name__)


class OrgToolsPlugin(BasePlugin):
    async def on_start(self) -> None:
        # Tools plugin currently provides admin routers only.
        logger.info("Org tools plugin started", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        logger.info("Org tools plugin stopped", plugin_id=self.plugin_id)
