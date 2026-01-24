from __future__ import annotations

from apps.api.config import get_settings
from apps.api.core.admin_ui import ADMIN_UI_RESOURCE_PROVIDER_EXTENSION_POINT
from apps.api.core.logging import get_logger
from apps.api.plugin.registry import registry
from apps.api.plugin.types import BasePlugin
from org.admin_ui import OrgAdminUIResourceProvider
from org.services import OrgService

logger = get_logger(__name__)


class OrgPlugin(BasePlugin):
    async def on_start(self) -> None:
        # Best-effort: if the plugin is upgraded to include directory fields, ensure they are populated.
        # For large organizations this should be moved to org.tools (async job), but it keeps early-stage
        # deployments consistent without manual intervention.
        service = OrgService(get_settings())
        await service.ensure_department_directory()
        registry.register_extension(
            self.plugin_id,
            ADMIN_UI_RESOURCE_PROVIDER_EXTENSION_POINT,
            OrgAdminUIResourceProvider(),
        )
        logger.info("Org plugin started", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        registry.unregister_extensions(self.plugin_id, ADMIN_UI_RESOURCE_PROVIDER_EXTENSION_POINT)
        logger.info("Org plugin stopped", plugin_id=self.plugin_id)
