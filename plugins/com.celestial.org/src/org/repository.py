from __future__ import annotations

from uuid import UUID

from apps.api.common.repositories import BaseRepository
from org.models import Department, Position, UserDepartment, UserPosition


class OrgRepository(BaseRepository):
    async def list_departments(self) -> list[Department]:
        return await Department.all().order_by("sort", "name")

    async def get_department(self, department_id: UUID) -> Department | None:
        return await Department.get_or_none(id=department_id)

    async def get_department_by_code(self, code: str) -> Department | None:
        return await Department.get_or_none(code=code)

    async def create_department(
        self,
        *,
        code: str | None,
        name: str,
        parent_id: UUID | None,
        sort: int,
        is_active: bool,
        description: str | None,
    ) -> Department:
        return await Department.create(
            code=code,
            name=name,
            parent_id=parent_id,
            sort=sort,
            is_active=is_active,
            description=description,
        )

    async def update_department(self, department: Department, *, updates: dict) -> Department:
        for key, value in updates.items():
            setattr(department, key, value)
        await department.save()
        return department

    async def delete_department(self, department_id: UUID) -> int:
        return await Department.filter(id=department_id).delete()

    async def department_has_children(self, department_id: UUID) -> bool:
        return await Department.filter(parent_id=department_id).exists()

    async def list_positions(self) -> list[Position]:
        return await Position.all().order_by("sort", "name")

    async def get_position(self, position_id: UUID) -> Position | None:
        return await Position.get_or_none(id=position_id)

    async def get_position_by_code(self, code: str) -> Position | None:
        return await Position.get_or_none(code=code)

    async def create_position(
        self,
        *,
        code: str,
        name: str,
        sort: int,
        is_active: bool,
        description: str | None,
    ) -> Position:
        return await Position.create(code=code, name=name, sort=sort, is_active=is_active, description=description)

    async def update_position(self, position: Position, *, updates: dict) -> Position:
        for key, value in updates.items():
            setattr(position, key, value)
        await position.save()
        return position

    async def delete_position(self, position_id: UUID) -> int:
        return await Position.filter(id=position_id).delete()

    async def list_user_departments(self, *, user_id: UUID) -> list[UserDepartment]:
        return await UserDepartment.filter(user_id=user_id).all().order_by("-is_primary", "created_at")

    async def ensure_user_department(self, *, user_id: UUID, department_id: UUID) -> UserDepartment:
        row, _ = await UserDepartment.get_or_create(user_id=user_id, department_id=department_id)
        return row

    async def remove_user_department(self, *, user_id: UUID, department_id: UUID) -> int:
        return await UserDepartment.filter(user_id=user_id, department_id=department_id).delete()

    async def clear_primary_department(self, *, user_id: UUID) -> int:
        return await UserDepartment.filter(user_id=user_id, is_primary=True).update(is_primary=False)

    async def set_primary_department(self, *, user_id: UUID, department_id: UUID) -> None:
        await self.clear_primary_department(user_id=user_id)
        await UserDepartment.filter(user_id=user_id, department_id=department_id).update(is_primary=True)

    async def list_user_positions(self, *, user_id: UUID) -> list[UserPosition]:
        return await UserPosition.filter(user_id=user_id).all().order_by("created_at")

    async def ensure_user_position(self, *, user_id: UUID, position_id: UUID) -> UserPosition:
        row, _ = await UserPosition.get_or_create(user_id=user_id, position_id=position_id)
        return row

    async def remove_user_position(self, *, user_id: UUID, position_id: UUID) -> int:
        return await UserPosition.filter(user_id=user_id, position_id=position_id).delete()
