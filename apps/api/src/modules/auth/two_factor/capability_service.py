from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from src.config import Settings
from src.core.exceptions import Unauthorized
from src.core.i18n import t
from src.core.services import BaseService
from src.modules.auth.two_factor.schema import TwoFactorCapabilitiesOut
from src.modules.auth.two_factor.service import AuthTwoFactorService


class _CredentialLike(Protocol):
    @property
    def password_hash(self) -> object: ...


class _UserLike(Protocol):
    @property
    def credential(self) -> object: ...


class _UserRepositoryLike(Protocol):
    async def get_by_id_with_credential(self, user_id: UUID) -> _UserLike | None: ...


class TwoFactorCapabilityService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        two_factor: AuthTwoFactorService | None = None,
        user_repo: _UserRepositoryLike | None = None,
    ) -> None:
        super().__init__(settings)
        self.two_factor = two_factor or AuthTwoFactorService(settings)
        if user_repo is None:
            from src.modules.auth.repository import UserRepository

            self.user_repo = cast(_UserRepositoryLike, UserRepository())
        else:
            self.user_repo = user_repo

    async def _get_status(self, *, user_id: UUID) -> tuple[bool, int]:
        return await self.two_factor.get_status(user_id=user_id)

    async def _get_user_with_credential(self, *, user_id: UUID) -> _UserLike | None:
        return await self.user_repo.get_by_id_with_credential(user_id)

    async def get_capabilities(self, *, user_id: UUID) -> TwoFactorCapabilitiesOut:
        user = await self._get_user_with_credential(user_id=user_id)
        if user is None:
            raise Unauthorized(message=t("auth", "USER_NOT_FOUND"), error="USER_NOT_FOUND")
        enabled, _ = await self._get_status(user_id=user_id)
        has_password = cast(_CredentialLike | None, getattr(user, "credential", None)) is not None
        return self.build_capabilities(enabled=enabled, has_password=has_password)

    def build_capabilities(self, *, enabled: bool, has_password: bool) -> TwoFactorCapabilitiesOut:
        setup_methods = [] if enabled else (["password"] if has_password else ["relogin"])
        two_factor_methods = ["totp", "backup_code"] if enabled else []
        return TwoFactorCapabilitiesOut(
            enabled=enabled,
            can_setup=not enabled,
            setup_required_reauth_methods=setup_methods,
            disable_required_reauth_methods=two_factor_methods,
            regenerate_backup_codes_required_reauth_methods=two_factor_methods,
            has_password=has_password,
        )
