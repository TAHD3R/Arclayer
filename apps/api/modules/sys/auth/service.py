from __future__ import annotations

from typing import cast
from uuid import UUID

from apps.api.common.services.base import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import Unauthorized
from apps.api.core.i18n import t
from apps.api.modules.auth.repository import UserRepository
from apps.api.modules.auth.security import build_sys_access_token, verify_password
from apps.api.modules.organization.models.user import User, UserCredential


class SysAuthService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.user_repo = UserRepository()

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    async def step_up(self, *, user: User, password: str) -> tuple[str, int]:
        user_id = cast(UUID, user.id)
        user_with_cred = await self.user_repo.get_by_id_with_credential(user_id)
        if user_with_cred is None:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        credential = cast(UserCredential | None, getattr(user_with_cred, "credential", None))
        if credential is None:
            raise Unauthorized(message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"), error="INVALID_CREDENTIALS")

        if not verify_password(password, credential.password_hash, self.settings.auth):
            raise Unauthorized(message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"), error="INVALID_CREDENTIALS")

        token, ttl = build_sys_access_token(
            user_id=user_id,
            token_version=int(getattr(user_with_cred, "token_version", 0) or 0),
            settings=self.settings.auth,
        )
        return token, ttl
