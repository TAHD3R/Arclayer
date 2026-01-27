from __future__ import annotations

from uuid import UUID

from apps.api.config import get_settings
from apps.api.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.routers.v1.admin.rbac.schema import PermissionOut, RoleOut
from rbac.repository import RBACRepository
from rbac.services import RBACService


class AdminRBACProviderImpl:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._repo = RBACRepository()
        self._service = RBACService(self._settings)

    async def list_roles(self, *, params: PageParams) -> PageData[RoleOut]:
        qs = self._repo.query_roles()
        return await paginate_queryset(qs, params=params, out_schema=RoleOut)

    async def get_role(self, *, role_code: str) -> RoleOut:
        role = await self._service.get_role(role_code=role_code)
        return RoleOut.model_validate(role, from_attributes=True)

    async def create_role(self, *, payload) -> RoleOut:
        role = await self._service.create_role(
            code=payload.code,
            name=payload.name,
            description=payload.description,
            is_default=bool(payload.is_default),
            is_superuser=bool(payload.is_superuser),
        )
        return RoleOut.model_validate(role, from_attributes=True)

    async def update_role(self, *, role_code: str, payload) -> RoleOut:
        updates = payload.model_dump(exclude_unset=True)
        role = await self._service.update_role(role_code=role_code, payload=updates)
        return RoleOut.model_validate(role, from_attributes=True)

    async def delete_role(self, *, role_code: str) -> None:
        await self._service.delete_role(role_code=role_code)

    async def list_permissions(self, *, params: PageParams) -> PageData[PermissionOut]:
        qs = self._repo.query_permissions()
        return await paginate_queryset(qs, params=params, out_schema=PermissionOut)

    async def sync_permissions(self):
        return await self._service.sync_permissions()

    async def list_role_permissions(self, *, role_code: str, params: PageParams) -> PageData[PermissionOut]:
        role = await self._service.get_role(role_code=role_code)
        qs = self._repo.query_permissions().filter(permission_roles__role_id=role.id)
        return await paginate_queryset(qs, params=params, out_schema=PermissionOut)

    async def set_role_permissions(self, *, role_code: str, permission_codes: list[str]) -> None:
        await self._service.set_role_permissions(role_code=role_code, permission_codes=permission_codes)

    async def list_user_roles(self, *, user_id: UUID, params: PageParams) -> PageData[RoleOut]:
        qs = self._repo.query_user_roles(user_id=user_id)
        return await paginate_queryset(qs, params=params, out_schema=RoleOut)

    async def assign_user_role(self, *, user_id: UUID, role_code: str) -> None:
        await self._service.assign_role(user_id=user_id, role_code=role_code)

    async def revoke_user_role(self, *, user_id: UUID, role_code: str) -> None:
        await self._service.revoke_role(user_id=user_id, role_code=role_code)
