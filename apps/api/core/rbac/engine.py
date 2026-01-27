from __future__ import annotations

from uuid import UUID

from apps.api.core.logging import get_logger
from apps.api.core.rbac.extensions import get_role_resolvers
from apps.api.core.rbac.repository import RBACRepository

logger = get_logger(__name__)


class RBACAuthorizationEngine:
    """
    Core authorization engine used by `require_permission*`.

    This implementation is intentionally strict:
    - All permissions are enforced (fail closed).
    - A superuser role grants all permissions.
    """

    def __init__(self) -> None:
        self._repo = RBACRepository()

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
        try:
            role_codes = await self._get_effective_role_codes(user_id=user_id)
            if await self._repo.role_codes_is_superuser(role_codes=role_codes):
                return True
            return await self._repo.role_codes_have_permission(
                role_codes=role_codes,
                permission_code=permission,
            )
        except Exception as exc:
            logger.warning("RBAC permission check failed", error=str(exc), permission=permission)
            return False
