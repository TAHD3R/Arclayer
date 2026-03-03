from __future__ import annotations

from fastapi import Depends

from apps.api.src.core.exceptions import Forbidden
from apps.api.src.core.i18n import t
from apps.api.src.modules.auth.http.service import get_current_access_payload, get_current_user
from apps.api.src.modules.organization.models.user import User


async def require_super_admin(
    user: User = Depends(get_current_user),
) -> User:
    if not bool(getattr(user, "is_super_admin", False)):
        raise Forbidden(
            message=t("auth", "FORBIDDEN", default="无权限"),
            error="SUPER_ADMIN_REQUIRED",
        )
    return user


async def require_sys_super_admin(
    user: User = Depends(get_current_user),
    payload=Depends(get_current_access_payload),
) -> User:
    """
    Require super admin and "step-up" sys context token.

    Security model:
    - Normal access tokens can authenticate users, but cannot call /sys governance endpoints.
    - Sys endpoints require a short-lived access token with claim `ctx=sys`.
    """

    if not bool(getattr(user, "is_super_admin", False)):
        raise Forbidden(
            message=t("auth", "FORBIDDEN", default="无权限"),
            error="SUPER_ADMIN_REQUIRED",
        )
    if (payload or {}).get("ctx") != "sys":
        raise Forbidden(
            message=t("auth", "FORBIDDEN", default="无权限"),
            error="SYS_STEP_UP_REQUIRED",
        )
    return user
