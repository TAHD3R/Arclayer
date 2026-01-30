from __future__ import annotations

from typing import Any, Protocol, cast
from uuid import UUID

from fastapi import Depends

from apps.api.common.constants.authz import AUTHZ_EXTENSION_POINT, AUTHZ_SNAPSHOT_EXTENSION_POINT
from apps.api.core.exceptions import Forbidden, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.plugin.registry import ExtensionPointType, registry


class AuthorizationEngine(Protocol):
    async def has_permission(self, user_id: UUID, permission: str) -> bool: ...


class AuthzSnapshotProvider(Protocol):
    async def get_snapshot(self, user_id: UUID) -> dict[str, Any]: ...


def _register_authz_extension_point() -> None:
    registry.register_extension_point(
        AUTHZ_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Authorization engine for permission checks.",
    )
    registry.register_extension_point(
        AUTHZ_SNAPSHOT_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Provides authorization snapshot for current user.",
    )


_register_authz_extension_point()


def get_authz_engine() -> AuthorizationEngine | None:
    engine = registry.get_extension(AUTHZ_EXTENSION_POINT)
    return cast(AuthorizationEngine | None, engine)


def get_authz_snapshot_provider() -> AuthzSnapshotProvider | None:
    provider = registry.get_extension(AUTHZ_SNAPSHOT_EXTENSION_POINT)
    return cast(AuthzSnapshotProvider | None, provider)


def require_permission(permission: str):
    # Local import to avoid circular dependency with auth router.
    from apps.api.core.organization.deps import OrgContext, get_current_org_context
    from apps.api.routers.v1.auth.deps import get_current_user_id

    async def _dependency(
        user_id: UUID = Depends(get_current_user_id),
        _ctx: OrgContext = Depends(get_current_org_context),
    ) -> None:
        engine = get_authz_engine()
        if engine is None:
            return
        allowed = await engine.has_permission(user_id, permission)
        if not allowed:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                error="PERMISSION_DENIED",
            )

    return Depends(_dependency)


def require_permission_strict(permission: str):
    # Local import to avoid circular dependency with auth router.
    from apps.api.core.organization.deps import OrgContext, get_current_org_context
    from apps.api.routers.v1.auth.deps import get_current_user_id

    async def _dependency(
        user_id: UUID = Depends(get_current_user_id),
        _ctx: OrgContext = Depends(get_current_org_context),
    ) -> None:
        engine = get_authz_engine()
        if engine is None:
            raise ServiceUnavailable(
                message=t("errors", "AUTHZ_ENGINE_UNAVAILABLE", default="鉴权引擎不可用"),
                error="AUTHZ_ENGINE_UNAVAILABLE",
            )
        allowed = await engine.has_permission(user_id, permission)
        if not allowed:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                error="PERMISSION_DENIED",
            )

    return Depends(_dependency)
