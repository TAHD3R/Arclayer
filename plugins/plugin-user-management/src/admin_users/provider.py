from __future__ import annotations

from uuid import UUID

from rbac.schema import AuthzSnapshot

from admin_users.service import AdminUsersService
from apps.api.http.pagination import PageData, PageParams
from apps.api.routers.v1.admin.users.schema import (
    AdminUserCreateRequest,
    AdminUserDetailOut,
    AdminUserListQuery,
    AdminUserSummaryOut,
    AdminUserUpdateRequest,
)


class AdminUsersProviderImpl:
    async def list_users(self, *, params: PageParams, filters: AdminUserListQuery) -> PageData[AdminUserSummaryOut]:
        service = AdminUsersService()
        return await service.list_users(params=params, filters=filters)

    async def get_user(self, *, user_id: UUID) -> AdminUserDetailOut:
        service = AdminUsersService()
        return await service.get_user(user_id=user_id)

    async def create_user(self, *, payload: AdminUserCreateRequest) -> AdminUserDetailOut:
        service = AdminUsersService()
        return await service.create_user(payload=payload)

    async def update_user(self, *, user_id: UUID, payload: AdminUserUpdateRequest) -> AdminUserDetailOut:
        service = AdminUsersService()
        return await service.update_user(user_id=user_id, payload=payload)

    async def set_user_status(self, *, user_id: UUID, enabled: bool) -> AdminUserDetailOut:
        service = AdminUsersService()
        return await service.set_user_status(user_id=user_id, enabled=enabled)

    async def reset_password(self, *, user_id: UUID, new_password: str) -> None:
        service = AdminUsersService()
        await service.reset_password(user_id=user_id, new_password=new_password)

    async def get_user_authz(self, *, user_id: UUID) -> AuthzSnapshot:
        service = AdminUsersService()
        return await service.get_user_authz(user_id=user_id)
