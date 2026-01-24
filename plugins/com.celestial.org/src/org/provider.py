from __future__ import annotations

from uuid import UUID

from apps.api.config import get_settings
from apps.api.core.exceptions import NotFound
from apps.api.core.i18n import t
from apps.api.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.routers.v1.admin.org.schema import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    PositionCreate,
    PositionOut,
    PositionUpdate,
    UserDepartmentOut,
    UserPositionOut,
)
from org.repository import OrgRepository
from org.services import OrgService


class AdminOrgProviderImpl:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._repo = OrgRepository()
        self._service = OrgService(self._settings)

    async def list_departments(self, *, params: PageParams) -> PageData[DepartmentOut]:
        qs = self._repo.query_departments()
        return await paginate_queryset(qs, params=params, out_schema=DepartmentOut)

    async def get_department(self, *, department_id: UUID) -> DepartmentOut:
        # Not exposed via router yet, but keep for completeness.
        item = await self._repo.get_department(department_id)
        if item is None:
            raise NotFound(message=t("org", "DEPARTMENT_NOT_FOUND", default="部门不存在"), error="DEPARTMENT_NOT_FOUND")
        return DepartmentOut.model_validate(item, from_attributes=True)

    async def create_department(self, *, payload: DepartmentCreate) -> DepartmentOut:
        item = await self._service.create_department(payload.model_dump())
        return DepartmentOut.model_validate(item, from_attributes=True)

    async def update_department(self, *, department_id: UUID, payload: DepartmentUpdate) -> DepartmentOut:
        item = await self._service.update_department(
            department_id=department_id, payload=payload.model_dump(exclude_unset=True)
        )
        return DepartmentOut.model_validate(item, from_attributes=True)

    async def delete_department(self, *, department_id: UUID) -> None:
        await self._service.delete_department(department_id=department_id)

    async def restore_department(self, *, department_id: UUID) -> DepartmentOut:
        restored = await self._service.restore_department(department_id=department_id)
        return DepartmentOut.model_validate(restored, from_attributes=True)

    async def list_positions(self, *, params: PageParams) -> PageData[PositionOut]:
        qs = self._repo.query_positions()
        return await paginate_queryset(qs, params=params, out_schema=PositionOut)

    async def get_position(self, *, position_id: UUID) -> PositionOut:
        item = await self._repo.get_position(position_id)
        if item is None:
            raise NotFound(message=t("org", "POSITION_NOT_FOUND", default="岗位不存在"), error="POSITION_NOT_FOUND")
        return PositionOut.model_validate(item, from_attributes=True)

    async def create_position(self, *, payload: PositionCreate) -> PositionOut:
        item = await self._service.create_position(payload.model_dump())
        return PositionOut.model_validate(item, from_attributes=True)

    async def update_position(self, *, position_id: UUID, payload: PositionUpdate) -> PositionOut:
        item = await self._service.update_position(
            position_id=position_id, payload=payload.model_dump(exclude_unset=True)
        )
        return PositionOut.model_validate(item, from_attributes=True)

    async def delete_position(self, *, position_id: UUID) -> None:
        await self._service.delete_position(position_id=position_id)

    async def list_user_departments(self, *, user_id: UUID, params: PageParams) -> PageData[UserDepartmentOut]:
        qs = self._repo.query_user_departments(user_id=user_id)
        return await paginate_queryset(qs, params=params, out_schema=UserDepartmentOut)

    async def assign_user_department(self, *, user_id: UUID, department_id: UUID, primary: bool) -> None:
        await self._service.assign_user_department(user_id=user_id, department_id=department_id, primary=primary)

    async def set_primary_department(self, *, user_id: UUID, department_id: UUID) -> None:
        await self._service.set_primary_department(user_id=user_id, department_id=department_id)

    async def revoke_user_department(self, *, user_id: UUID, department_id: UUID) -> None:
        await self._service.revoke_user_department(user_id=user_id, department_id=department_id)

    async def list_user_positions(self, *, user_id: UUID, params: PageParams) -> PageData[UserPositionOut]:
        qs = self._repo.query_user_positions(user_id=user_id)
        return await paginate_queryset(qs, params=params, out_schema=UserPositionOut)

    async def assign_user_position(self, *, user_id: UUID, position_id: UUID) -> None:
        await self._service.assign_user_position(user_id=user_id, position_id=position_id)

    async def revoke_user_position(self, *, user_id: UUID, position_id: UUID) -> None:
        await self._service.revoke_user_position(user_id=user_id, position_id=position_id)
