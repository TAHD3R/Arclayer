from __future__ import annotations

from apps.api.core.admin_org_tools import ADMIN_ORG_TOOLS_PROVIDER_EXTENSION_POINT
from apps.api.core.logging import get_logger
from apps.api.plugin.registry import registry
from apps.api.plugin.types import BasePlugin
from org_tools.provider import AdminOrgToolsProviderImpl

logger = get_logger(__name__)


class OrgToolsPlugin(BasePlugin):
    async def on_start(self) -> None:
        registry.register_extension(
            self.plugin_id, ADMIN_ORG_TOOLS_PROVIDER_EXTENSION_POINT, AdminOrgToolsProviderImpl()
        )
        logger.info("Org tools plugin started", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        registry.unregister_extensions(self.plugin_id, ADMIN_ORG_TOOLS_PROVIDER_EXTENSION_POINT)
        logger.info("Org tools plugin stopped", plugin_id=self.plugin_id)
