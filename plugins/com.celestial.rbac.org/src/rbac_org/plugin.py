from __future__ import annotations

from uuid import UUID

from rbac.extensions import RBAC_ROLE_RESOLVER_EXTENSION_POINT

from apps.api.config import get_settings
from apps.api.core.logging import get_logger
from apps.api.plugin.registry import registry
from apps.api.plugin.types import BasePlugin
from rbac_org.services import RBACOrgService

logger = get_logger(__name__)


class _OrgRoleResolver:
    def __init__(self, service: RBACOrgService) -> None:
        self._service = service

    async def get_role_codes(self, *, user_id: UUID) -> list[str]:
        return await self._service.resolve_role_codes(user_id=user_id)


class RBACOrgPlugin(BasePlugin):
    async def on_start(self) -> None:
        # Register resolver so org bindings affect RBAC effective roles.
        service = RBACOrgService(get_settings())
        registry.register_extension(self.plugin_id, RBAC_ROLE_RESOLVER_EXTENSION_POINT, _OrgRoleResolver(service))
        logger.info("RBAC org bridge plugin started", plugin_id=self.plugin_id)

    async def on_stop(self) -> None:
        registry.unregister_extensions(self.plugin_id, RBAC_ROLE_RESOLVER_EXTENSION_POINT)
        logger.info("RBAC org bridge plugin stopped", plugin_id=self.plugin_id)
