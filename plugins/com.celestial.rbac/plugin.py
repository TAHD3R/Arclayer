from __future__ import annotations

from rbac.engine import RBACAuthorizationEngine
from rbac.services import RBACService

from apps.api.config import get_settings
from apps.api.core.authz import AUTHZ_EXTENSION_POINT
from apps.api.core.logging import get_logger
from apps.api.plugin.registry import registry
from apps.api.plugin.types import BasePlugin

logger = get_logger(__name__)


class RBACPlugin(BasePlugin):
    async def on_start(self) -> None:
        service = RBACService(get_settings())
        await service.ensure_system_roles()
        await service.sync_permissions()
        engine = RBACAuthorizationEngine(self.descriptor)
        registry.register_extension(self.plugin_id, AUTHZ_EXTENSION_POINT, engine)
        logger.info("RBAC plugin started", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        registry.unregister_extensions(self.plugin_id, AUTHZ_EXTENSION_POINT)
        logger.info("RBAC plugin stopped", plugin_id=self.plugin_id)
