from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from fastapi import Depends

from apps.api.core.exceptions import Forbidden
from apps.api.plugin.registry import ExtensionPointType, registry
from apps.api.routers.v1.auth.deps import get_current_user_id

AUTHZ_EXTENSION_POINT = "authorization-engine"


class AuthorizationEngine(Protocol):
    async def has_permission(self, user_id: UUID, permission: str) -> bool: ...


def _register_authz_extension_point() -> None:
    registry.register_extension_point(
        AUTHZ_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Authorization engine for permission checks.",
    )


_register_authz_extension_point()


def get_authz_engine() -> AuthorizationEngine | None:
    engine = registry.get_extension(AUTHZ_EXTENSION_POINT)
    return cast(AuthorizationEngine | None, engine)


def require_permission(permission: str):
    async def _dependency(user_id: UUID = Depends(get_current_user_id)) -> None:
        engine = get_authz_engine()
        if engine is None:
            return
        allowed = await engine.has_permission(user_id, permission)
        if not allowed:
            raise Forbidden(message="权限不足", error="PERMISSION_DENIED")

    return Depends(_dependency)
