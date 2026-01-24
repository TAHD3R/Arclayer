from __future__ import annotations

from apps.api.config import get_settings
from apps.api.core.authz import AUTHZ_EXTENSION_POINT, AUTHZ_SNAPSHOT_EXTENSION_POINT
from apps.api.core.logging import get_logger
from apps.api.plugin.registry import registry
from apps.api.plugin.types import BasePlugin
from rbac.engine import RBACAuthorizationEngine
from rbac.services import RBACService

logger = get_logger(__name__)


class RBACAuthzSnapshotProvider:
    async def get_snapshot(self, user_id):
        service = RBACService(get_settings())
        return await service.get_my_authz(user_id=user_id)


class RBACPlugin(BasePlugin):
    async def on_start(self) -> None:
        service = RBACService(get_settings())
        await service.ensure_system_roles()
        await service.sync_permissions()
        engine = RBACAuthorizationEngine(self.descriptor)
        registry.register_extension(self.plugin_id, AUTHZ_EXTENSION_POINT, engine)
        registry.register_extension(self.plugin_id, AUTHZ_SNAPSHOT_EXTENSION_POINT, RBACAuthzSnapshotProvider())
        logger.info("RBAC plugin started", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        registry.unregister_extensions(self.plugin_id, AUTHZ_EXTENSION_POINT)
        registry.unregister_extensions(self.plugin_id, AUTHZ_SNAPSHOT_EXTENSION_POINT)
        logger.info("RBAC plugin stopped", plugin_id=self.plugin_id)
