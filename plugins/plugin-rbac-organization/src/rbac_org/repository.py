from __future__ import annotations

from uuid import UUID

from rbac.models import Role
from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from rbac_org.models import DepartmentRole, PositionRole


class RBACOrgRepository(BaseRepository):
    def query_position_roles(self, *, position_id: UUID) -> QuerySet[Role]:
        return Role.filter(rbac_org_position_roles__position_id=position_id).order_by("code")

    async def list_position_roles(self, *, position_id: UUID) -> list[Role]:
        rows = await Role.filter(rbac_org_position_roles__position_id=position_id).all()
        return sorted(rows, key=lambda item: item.code)

    async def replace_position_roles(self, *, position_id: UUID, role_ids: list[UUID]) -> None:
        await PositionRole.filter(position_id=position_id).delete()
        for rid in role_ids:
            await PositionRole.get_or_create(position_id=position_id, role_id=rid)

    async def add_position_role(self, *, position_id: UUID, role_id: UUID) -> None:
        await PositionRole.get_or_create(position_id=position_id, role_id=role_id)

    async def remove_position_role(self, *, position_id: UUID, role_id: UUID) -> int:
        return await PositionRole.filter(position_id=position_id, role_id=role_id).delete()

    def query_department_roles(self, *, department_id: UUID) -> QuerySet[Role]:
        return Role.filter(rbac_org_department_roles__department_id=department_id).order_by("code")

    async def list_department_roles(self, *, department_id: UUID) -> list[Role]:
        rows = await Role.filter(rbac_org_department_roles__department_id=department_id).all()
        return sorted(rows, key=lambda item: item.code)

    async def replace_department_roles(self, *, department_id: UUID, role_ids: list[UUID]) -> None:
        await DepartmentRole.filter(department_id=department_id).delete()
        for rid in role_ids:
            await DepartmentRole.get_or_create(department_id=department_id, role_id=rid)

    async def add_department_role(self, *, department_id: UUID, role_id: UUID) -> None:
        await DepartmentRole.get_or_create(department_id=department_id, role_id=role_id)

    async def remove_department_role(self, *, department_id: UUID, role_id: UUID) -> int:
        return await DepartmentRole.filter(department_id=department_id, role_id=role_id).delete()

    async def list_role_codes_for_user_positions(self, *, user_id: UUID) -> list[str]:
        # Only active positions contribute roles.
        rows = await Role.filter(
            rbac_org_position_roles__position__org_users__user_id=user_id,
            rbac_org_position_roles__position__is_active=True,
        ).values_list("code", flat=True)
        return sorted(set(rows))

    async def list_role_codes_for_user_departments(self, *, user_id: UUID) -> list[str]:
        # Default: all departments (not only primary) contribute roles; no hierarchy inheritance.
        rows = await Role.filter(
            rbac_org_department_roles__department__org_users__user_id=user_id,
            rbac_org_department_roles__department__is_active=True,
            rbac_org_department_roles__department__deleted_at__isnull=True,
        ).values_list("code", flat=True)
        return sorted(set(rows))
