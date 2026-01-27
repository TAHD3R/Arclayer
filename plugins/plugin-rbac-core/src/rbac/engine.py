from __future__ import annotations

from typing import Any
from uuid import UUID

from apps.api.core.logging import get_logger
from apps.api.plugin.types import PluginDescriptor
from rbac.constants import ROLE_ADMIN
from rbac.extensions import get_role_resolvers
from rbac.repository import RBACRepository

logger = get_logger(__name__)

ALWAYS_ENFORCED_PREFIXES = ("admin:", "system:", "rbac:")


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

    def _is_enforced(self, permission: str) -> bool:
        if permission.startswith(ALWAYS_ENFORCED_PREFIXES):
            return True
        return _get_bool(self._config, "general", "enforcement", False)

    async def _get_effective_role_codes(self, *, user_id: UUID) -> list[str]:
        role_codes = set(await self._repo.list_user_role_codes(user_id=user_id))
        for resolver in get_role_resolvers():
            try:
                extra = await resolver.get_role_codes(user_id=user_id)
            except Exception as exc:
                # Fail closed: ignore resolver output on error to avoid privilege escalation.
                logger.warning("RBAC role resolver failed", error=str(exc))
                continue
            if not extra:
                continue
            role_codes.update(str(code) for code in extra if code)
        return sorted(role_codes)

    async def has_permission(self, user_id: UUID, permission: str) -> bool:
        if not self._is_enforced(permission):
            return True
        try:
            role_codes = await self._get_effective_role_codes(user_id=user_id)
            if ROLE_ADMIN in role_codes:
                return True
            if await self._repo.role_codes_is_superuser(role_codes=role_codes):
                return True
            return await self._repo.role_codes_have_permission(role_codes=role_codes, permission_code=permission)
        except Exception as exc:
            logger.warning("RBAC permission check failed", error=str(exc), permission=permission)
            return False
