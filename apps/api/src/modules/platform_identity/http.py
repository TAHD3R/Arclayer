from __future__ import annotations

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.config import Settings, get_settings
from src.core.exceptions import Forbidden, Unauthorized
from src.core.i18n import t
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_identity.sessions import ensure_platform_permission, resolve_platform_session
from src.settings.env_models import PlatformAuthSettings

platform_bearer_scheme = HTTPBearer(auto_error=False)


def get_platform_auth_settings(settings: Settings = Depends(get_settings)) -> PlatformAuthSettings:
    return settings.platform_auth


def get_platform_identity_repository() -> PlatformIdentityRepository:
    return PlatformIdentityRepository()


async def get_current_platform_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(platform_bearer_scheme),
    settings: PlatformAuthSettings = Depends(get_platform_auth_settings),
    repository: PlatformIdentityRepository = Depends(get_platform_identity_repository),
) -> PlatformSessionPrincipal:
    if credentials is None:
        raise Unauthorized(message=t("errors", "PLATFORM_UNAUTHORIZED"), error="PLATFORM_UNAUTHORIZED")
    return await resolve_platform_session(token=credentials.credentials, settings=settings, repository=repository)


def require_platform_permission(permission_code: str):
    """Build a Platform-only dependency for one exact current permission."""

    async def _dependency(
        principal: PlatformSessionPrincipal = Depends(get_current_platform_session),
        repository: PlatformIdentityRepository = Depends(get_platform_identity_repository),
    ) -> PlatformSessionPrincipal:
        await ensure_platform_permission(
            permission_code=permission_code,
            principal=principal,
            repository=repository,
        )
        return principal

    return Depends(_dependency)


async def require_instance_owner(
    principal: PlatformSessionPrincipal = Depends(get_current_platform_session),
) -> PlatformSessionPrincipal:
    if not principal.is_instance_owner:
        raise Forbidden(
            message=t("errors", "PLATFORM_INSTANCE_OWNER_REQUIRED"),
            error="PLATFORM_INSTANCE_OWNER_REQUIRED",
        )
    return principal
