from __future__ import annotations

from typing import Any
from uuid import UUID

from apps.api.core.logging import get_logger
from apps.api.plugin.types import PluginDescriptor
from rbac.constants import ROLE_ADMIN
from rbac.repository import RBACRepository

logger = get_logger(__name__)


def _get_bool(config: dict[str, Any], section: str, key: str, default: bool) -> bool:
    values = config.get(section, {})
    if not isinstance(values, dict):
        return default
    value = values.get(key)
    if value is None:
        return default
    return bool(value)


class RBACAuthorizationEngine:
    def __init__(self, descriptor: PluginDescriptor) -> None:
        self._descriptor = descriptor
        self._repo = RBACRepository()
        self._config = descriptor.config or {}

    def _is_enforced(self) -> bool:
        return _get_bool(self._config, "general", "enforcement", False)

    async def has_permission(self, user_id: UUID, permission: str) -> bool:
        if not self._is_enforced():
            return True
        try:
            if await self._repo.user_has_role(user_id=user_id, role_code=ROLE_ADMIN):
                return True
            return await self._repo.user_has_permission(user_id=user_id, permission_code=permission)
        except Exception as exc:
            logger.warning("RBAC permission check failed", error=str(exc), permission=permission)
            return False
