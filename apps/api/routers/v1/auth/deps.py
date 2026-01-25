from __future__ import annotations

from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from structlog.contextvars import bind_contextvars

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import Forbidden, Unauthorized
from apps.api.core.i18n import t
from apps.api.models.user import User
from apps.api.routers.v1.auth.repository import UserRepository
from apps.api.routers.v1.auth.security import TOKEN_TYPE_ACCESS, decode_token

bearer_scheme = HTTPBearer(auto_error=False)


def _parse_user_id(raw: str | None) -> UUID:
    if not raw:
        raise Unauthorized(message=t("auth", "TOKEN_INVALID", default="Token 无效"), error="TOKEN_INVALID")
    try:
        return UUID(str(raw))
    except ValueError as exc:
        raise Unauthorized(message=t("auth", "TOKEN_INVALID", default="Token 无效"), error="TOKEN_INVALID") from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> User:
    if credentials is None:
        raise Unauthorized(message=t("auth", "UNAUTHORIZED", default="未授权"), error="UNAUTHORIZED")

    payload = decode_token(credentials.credentials, settings.auth)
    if payload.get("typ") != TOKEN_TYPE_ACCESS:
        raise Unauthorized(message=t("auth", "TOKEN_INVALID", default="Token 无效"), error="TOKEN_INVALID")

    user_id = _parse_user_id(payload.get("sub"))
    user_repo = UserRepository()
    user = await user_repo.get_by_id(user_id)
    if not user:
        raise Unauthorized(message=t("auth", "USER_NOT_FOUND", default="用户不存在"), error="USER_NOT_FOUND")

    if not user_repo.is_active(user):
        raise Forbidden(message=t("auth", "USER_DISABLED", default="账号不可用"), error="USER_DISABLED")

    if user.token_version != payload.get("ver"):
        raise Unauthorized(message=t("auth", "TOKEN_STALE", default="Token 已失效"), error="TOKEN_STALE")

    # Bind user context for downstream logs within this request.
    bind_contextvars(user_id=str(user.id))
    return user


async def get_current_user_id(
    user: User = Depends(get_current_user),
) -> UUID:
    return user.id
