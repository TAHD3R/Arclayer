from __future__ import annotations

from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from structlog.contextvars import bind_contextvars

from src.common.constants.auth import TOKEN_TYPE_ACCESS
from src.config import Settings, get_settings
from src.core.exceptions import Forbidden, Unauthorized
from src.core.i18n import t
from src.models.organization.user import User
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import decode_token

bearer_scheme = HTTPBearer(auto_error=False)


def _parse_user_id(raw: object | None) -> UUID:
    if raw is None:
        raise Unauthorized(message=t("auth", "TOKEN_INVALID"), error="TOKEN_INVALID")
    if isinstance(raw, str) and not raw:
        raise Unauthorized(message=t("auth", "TOKEN_INVALID"), error="TOKEN_INVALID")
    try:
        return UUID(str(raw))
    except ValueError as exc:
        raise Unauthorized(message=t("auth", "TOKEN_INVALID"), error="TOKEN_INVALID") from exc


async def get_current_access_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    """
    Return the decoded JWT payload for the current access token.

    Notes:
    - Used by sys-governance endpoints to enforce step-up context (ctx=sys).
    - Keep this dependency lightweight: do not load user records here.
    """

    if credentials is None:
        raise Unauthorized(message=t("auth", "UNAUTHORIZED"), error="UNAUTHORIZED")

    payload = decode_token(credentials.credentials, settings.auth)
    if payload.get("typ") != TOKEN_TYPE_ACCESS:
        raise Unauthorized(message=t("auth", "TOKEN_INVALID"), error="TOKEN_INVALID")
    return payload


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> User:
    if credentials is None:
        raise Unauthorized(message=t("auth", "UNAUTHORIZED"), error="UNAUTHORIZED")

    payload = await get_current_access_payload(credentials=credentials, settings=settings)

    user_id = _parse_user_id(payload.get("sub"))
    user_repo = UserRepository()
    user = await user_repo.get_by_id(user_id)
    if not user:
        raise Unauthorized(message=t("auth", "USER_NOT_FOUND"), error="USER_NOT_FOUND")

    if not user_repo.is_active(user):
        raise Forbidden(message=t("auth", "USER_DISABLED"), error="USER_DISABLED")

    if user.token_version != payload.get("ver"):
        raise Unauthorized(message=t("auth", "TOKEN_STALE"), error="TOKEN_STALE")

    # Bind user context for downstream logs within this request.
    bind_contextvars(user_id=str(user.id))
    return user


async def require_super_admin(
    user: User = Depends(get_current_user),
) -> User:
    if not bool(getattr(user, "is_super_admin", False)):
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED"),
            error="SUPER_ADMIN_REQUIRED",
        )
    return user


async def get_current_user_id(
    user: User = Depends(get_current_user),
) -> UUID:
    return user.id
