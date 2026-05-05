from __future__ import annotations

from typing import cast
from uuid import UUID

from src.config import Settings
from src.core.exceptions import Forbidden, Unauthorized
from src.core.i18n import t
from src.core.services import BaseService
from src.models.organization.user import User
from src.modules.auth.account_deletion.guard import AccountDeletionGuard
from src.modules.auth.oauth.social.repository import OAuthSocialRepository
from src.modules.auth.repository import UserRepository
from src.modules.auth.schema import DeleteMyAccountCapabilityOut


class AccountDeletionCapabilityService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.user_repo = UserRepository()
        self.oauth_repo = OAuthSocialRepository()

    async def get_capabilities(self, *, user: User, two_factor_enabled: bool) -> DeleteMyAccountCapabilityOut:
        user_with_cred = cast(User | None, await self.user_repo.get_by_id_with_credential(UUID(str(user.id))))
        if user_with_cred is None:
            raise Unauthorized(message=t("auth:USER_NOT_FOUND"), error="USER_NOT_FOUND")
        has_password = getattr(user_with_cred, "credential", None) is not None
        has_linked_oauth_identities = await self._has_linked_oauth_identities(user_id=UUID(str(user.id)))
        blocked_reason = await self._get_blocked_reason(user=user_with_cred)
        return DeleteMyAccountCapabilityOut(
            email=user_with_cred.email,
            can_delete=blocked_reason is None,
            blocked_reason=blocked_reason,
            required_reauth_methods=self._required_reauth_methods(
                has_password=has_password,
                two_factor_enabled=two_factor_enabled,
            ),
            has_password=has_password,
            two_factor_enabled=two_factor_enabled,
            has_linked_oauth_identities=has_linked_oauth_identities,
        )

    async def _get_blocked_reason(self, *, user: User) -> str | None:
        if not user.email:
            return "EMAIL_REQUIRED"
        try:
            await AccountDeletionGuard().ensure_deletable(user_id=UUID(str(user.id)))
        except Forbidden as exc:
            return str(exc.error or "ACCOUNT_DELETE_BLOCKED")
        return None

    async def _has_linked_oauth_identities(self, *, user_id: UUID) -> bool:
        return await self.oauth_repo.has_identity_for_user(user_id=user_id)

    @staticmethod
    def _required_reauth_methods(*, has_password: bool, two_factor_enabled: bool) -> list[str]:
        if has_password:
            return ["password"]
        if two_factor_enabled:
            return ["2fa"]
        return ["relogin"]
