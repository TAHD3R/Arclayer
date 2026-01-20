from __future__ import annotations

from fastapi import Depends
from rbac.services import RBACService

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import Forbidden
from apps.api.models.user import User
from apps.api.routers.v1.auth.deps import get_current_user


def get_rbac_service(settings: Settings = Depends(get_settings)) -> RBACService:
    return RBACService(settings)


async def require_admin(
    user: User = Depends(get_current_user),
    service: RBACService = Depends(get_rbac_service),
) -> User:
    if not await service.is_admin(user_id=user.id):
        raise Forbidden(message="需要管理员权限", error="ADMIN_REQUIRED")
    return user
