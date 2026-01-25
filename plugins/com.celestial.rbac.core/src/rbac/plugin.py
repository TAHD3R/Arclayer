from __future__ import annotations

from apps.api.config import get_settings
from apps.api.core.authz import AUTHZ_EXTENSION_POINT, AUTHZ_SNAPSHOT_EXTENSION_POINT
from apps.api.core.logging import get_logger
from apps.api.plugin.extension_points.admin_rbac import ADMIN_RBAC_PROVIDER_EXTENSION_POINT
from apps.api.plugin.extension_points.admin_ui import ADMIN_UI_RESOURCE_PROVIDER_EXTENSION_POINT
from apps.api.plugin.registry import registry
from apps.api.plugin.types import BasePlugin
from rbac.admin_ui import RBACAdminUIResourceProvider
from rbac.engine import RBACAuthorizationEngine
from rbac.provider import AdminRBACProviderImpl
from rbac.services import RBACService

logger = get_logger(__name__)


class RBACAuthzSnapshotProvider:
    async def get_snapshot(self, user_id):
        service = RBACService(get_settings())
        snap = await service.get_my_authz(user_id=user_id)
        return snap.model_dump()


class RBACPlugin(BasePlugin):
    async def on_start(self) -> None:
        service = RBACService(get_settings())
        await service.ensure_system_roles()
        await service.sync_permissions()

        # Authz can be provided by a different plugin (or overridden in tests).
        # Do not fail startup if another engine/snapshot provider is already registered.
        if registry.get_extension(AUTHZ_EXTENSION_POINT) is None:
            engine = RBACAuthorizationEngine(self.descriptor)
            registry.register_extension(self.plugin_id, AUTHZ_EXTENSION_POINT, engine)
        else:
            logger.info(
                "Authz engine already registered, skip RBAC authz engine",
                plugin_id=self.plugin_id,
            )

        if registry.get_extension(AUTHZ_SNAPSHOT_EXTENSION_POINT) is None:
            registry.register_extension(self.plugin_id, AUTHZ_SNAPSHOT_EXTENSION_POINT, RBACAuthzSnapshotProvider())
        else:
            logger.info(
                "Authz snapshot provider already registered, skip RBAC snapshot provider",
                plugin_id=self.plugin_id,
            )

        registry.register_extension(self.plugin_id, ADMIN_RBAC_PROVIDER_EXTENSION_POINT, AdminRBACProviderImpl())
        registry.register_extension(
            self.plugin_id,
            ADMIN_UI_RESOURCE_PROVIDER_EXTENSION_POINT,
            RBACAdminUIResourceProvider(),
        )
        logger.info("RBAC plugin started", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        registry.unregister_extensions(self.plugin_id, AUTHZ_EXTENSION_POINT)
        registry.unregister_extensions(self.plugin_id, AUTHZ_SNAPSHOT_EXTENSION_POINT)
        registry.unregister_extensions(self.plugin_id, ADMIN_RBAC_PROVIDER_EXTENSION_POINT)
        registry.unregister_extensions(self.plugin_id, ADMIN_UI_RESOURCE_PROVIDER_EXTENSION_POINT)
        logger.info("RBAC plugin stopped", plugin_id=self.plugin_id)
