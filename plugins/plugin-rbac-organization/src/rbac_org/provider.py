from __future__ import annotations

from uuid import UUID

from apps.api.config import get_settings
from apps.api.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.routers.v1.admin.rbac.schema import RoleOut
from rbac_org.repository import RBACOrgRepository
from rbac_org.services import RBACOrgService


class AdminRBACOrgProviderImpl:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._repo = RBACOrgRepository()
        self._service = RBACOrgService(self._settings)

    async def list_position_roles(self, *, position_id: UUID, params: PageParams) -> PageData[RoleOut]:
        qs = self._repo.query_position_roles(position_id=position_id)
        return await paginate_queryset(qs, params=params, out_schema=RoleOut)

    async def set_position_roles(self, *, position_id: UUID, role_codes: list[str]) -> None:
        await self._service.set_position_roles(position_id=position_id, role_codes=role_codes)

    async def add_position_role(self, *, position_id: UUID, role_code: str) -> None:
        await self._service.add_position_role(position_id=position_id, role_code=role_code)

    async def remove_position_role(self, *, position_id: UUID, role_code: str) -> None:
        await self._service.remove_position_role(position_id=position_id, role_code=role_code)

    async def list_department_roles(self, *, department_id: UUID, params: PageParams) -> PageData[RoleOut]:
        qs = self._repo.query_department_roles(department_id=department_id)
        return await paginate_queryset(qs, params=params, out_schema=RoleOut)

    async def set_department_roles(self, *, department_id: UUID, role_codes: list[str]) -> None:
        await self._service.set_department_roles(department_id=department_id, role_codes=role_codes)

    async def add_department_role(self, *, department_id: UUID, role_code: str) -> None:
        await self._service.add_department_role(department_id=department_id, role_code=role_code)

    async def remove_department_role(self, *, department_id: UUID, role_code: str) -> None:
        await self._service.remove_department_role(department_id=department_id, role_code=role_code)
