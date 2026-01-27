from __future__ import annotations

from uuid import UUID

from tortoise.exceptions import IntegrityError

from apps.api.common.services import BaseService
from apps.api.config import Settings, get_settings
from apps.api.core.authz import get_authz_snapshot_provider
from apps.api.core.exceptions import Conflict, NotFound, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.models.user import UserStatus
from apps.api.routers.v1.admin.users.repository import AdminUsersRepository
from apps.api.routers.v1.admin.users.schema import (
    AdminUserCreateRequest,
    AdminUserDetailOut,
    AdminUserListQuery,
    AdminUserSummaryOut,
    AdminUserUpdateRequest,
)
from apps.api.routers.v1.auth.repository import UserRepository
from apps.api.routers.v1.auth.schema import AuthzSnapshot
from apps.api.routers.v1.auth.security import hash_password


class AdminUsersService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = AdminUsersRepository()
        self.user_repo = UserRepository()

    @classmethod
    def from_settings(cls) -> AdminUsersService:
        return cls(get_settings())

    async def list_users(self, *, params: PageParams, filters: AdminUserListQuery) -> PageData[AdminUserSummaryOut]:
        qs = self.repo.query_users(filters=filters)
        return await paginate_queryset(qs, params=params, out_schema=AdminUserSummaryOut)

    async def get_user(self, *, user_id: UUID) -> AdminUserDetailOut:
        user = await self.repo.get_user(user_id=user_id)
        if user is None:
            raise NotFound(message=t("auth", "USER_NOT_FOUND", default="用户不存在"), error="NOT_FOUND")
        return AdminUserDetailOut.model_validate(user, from_attributes=True)

    async def create_user(self, *, payload: AdminUserCreateRequest) -> AdminUserDetailOut:
        username = payload.username.strip()
        email = payload.email.strip() if payload.email else None

        if await self.user_repo.exists_username(username):
            raise Conflict(message=t("auth", "USERNAME_EXISTS", default="用户名已存在"), error="CONFLICT")
        if email and await self.user_repo.exists_email(email):
            raise Conflict(message=t("auth", "EMAIL_EXISTS", default="邮箱已存在"), error="CONFLICT")

        password_hash = hash_password(payload.password, self.settings.auth)
        try:
            user = await self.user_repo.create_user(
                username=username,
                email=email,
                display_name=payload.display_name,
                password_hash=password_hash,
            )
        except IntegrityError as exc:
            raise Conflict(message=t("errors", "CONFLICT", default="资源冲突"), error="CONFLICT") from exc

        return AdminUserDetailOut.model_validate(user, from_attributes=True)

    async def update_user(self, *, user_id: UUID, payload: AdminUserUpdateRequest) -> AdminUserDetailOut:
        user = await self.repo.get_user(user_id=user_id)
        if user is None:
            raise NotFound(message=t("auth", "USER_NOT_FOUND", default="用户不存在"), error="NOT_FOUND")

        updates: dict = {}
        if payload.email is not None:
            email = payload.email.strip() if payload.email else None
            if email and email != user.email and await self.user_repo.exists_email(email):
                raise Conflict(message=t("auth", "EMAIL_EXISTS", default="邮箱已存在"), error="CONFLICT")
            updates["email"] = email
        if payload.display_name is not None:
            updates["display_name"] = payload.display_name
        if payload.avatar_url is not None:
            updates["avatar_url"] = payload.avatar_url

        if updates:
            try:
                user = await self.repo.save_updates(user, updates=updates)
            except IntegrityError as exc:
                raise Conflict(message=t("errors", "CONFLICT", default="资源冲突"), error="CONFLICT") from exc

        return AdminUserDetailOut.model_validate(user, from_attributes=True)

    async def set_user_status(self, *, user_id: UUID, enabled: bool) -> AdminUserDetailOut:
        user = await self.repo.get_user(user_id=user_id)
        if user is None:
            raise NotFound(message=t("auth", "USER_NOT_FOUND", default="用户不存在"), error="NOT_FOUND")

        status = UserStatus.ACTIVE if enabled else UserStatus.DISABLED
        if user.status != status:
            user.status = status
            await user.save(update_fields=["status"])

        return AdminUserDetailOut.model_validate(user, from_attributes=True)

    async def reset_password(self, *, user_id: UUID, new_password: str) -> None:
        user = await self.user_repo.get_by_id_with_credential(user_id)
        if user is None:
            raise NotFound(message=t("auth", "USER_NOT_FOUND", default="用户不存在"), error="NOT_FOUND")

        password_hash = hash_password(new_password, self.settings.auth)
        await self.user_repo.set_password(user, password_hash)
        await self.user_repo.increment_token_version(user)

    async def get_user_authz(self, *, user_id: UUID) -> AuthzSnapshot:
        user = await self.repo.get_user(user_id=user_id)
        if user is None:
            raise NotFound(message=t("auth", "USER_NOT_FOUND", default="用户不存在"), error="NOT_FOUND")

        provider = get_authz_snapshot_provider()
        if provider is None:
            raise ServiceUnavailable(
                message=t("errors", "AUTHZ_ENGINE_UNAVAILABLE", default="鉴权引擎不可用"),
                error="AUTHZ_ENGINE_UNAVAILABLE",
            )
        payload = await provider.get_snapshot(user.id)
        return AuthzSnapshot.model_validate(payload)
