from __future__ import annotations

from uuid import UUID

from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from org.models import Department, Position, UserDepartment, UserPosition


class OrgRepository(BaseRepository):
    def _departments_base_qs(self, *, include_deleted: bool = False) -> QuerySet[Department]:
        qs = Department.all()
        if not include_deleted:
            qs = qs.filter(deleted_at__isnull=True)
        return qs

    def query_departments(self) -> QuerySet[Department]:
        return self._departments_base_qs().order_by("sort", "name")

    async def list_departments(self) -> list[Department]:
        return await self._departments_base_qs().order_by("sort", "name")

    async def get_department(self, department_id: UUID) -> Department | None:
        return await self._departments_base_qs().get_or_none(id=department_id)

    async def get_department_by_code(self, code: str) -> Department | None:
        return await self._departments_base_qs().get_or_none(code=code)

    async def create_department(
        self,
        *,
        department_id: UUID,
        code: str | None,
        name: str,
        parent_id: UUID | None,
        path: str,
        depth: int,
        sort: int,
        is_active: bool,
        description: str | None,
    ) -> Department:
        return await Department.create(
            id=department_id,
            code=code,
            name=name,
            parent_id=parent_id,
            path=path,
            depth=depth,
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
        # Deprecated: departments use soft delete at service layer.
        return await Department.filter(id=department_id).delete()

    async def department_has_children(self, department_id: UUID) -> bool:
        return await Department.filter(parent_id=department_id, deleted_at__isnull=True).exists()

    async def department_has_users(self, department_id: UUID) -> bool:
        return await UserDepartment.filter(department_id=department_id).exists()

    async def soft_delete_department(self, department: Department) -> Department:
        # Keep implementation here so service can remain thin and consistent.
        from datetime import UTC, datetime

        if department.deleted_at is None:
            department.deleted_at = datetime.now(UTC)
        department.is_active = False
        await department.save(update_fields=["deleted_at", "is_active"])
        return department

    async def restore_department(self, department: Department) -> Department:
        department.deleted_at = None
        department.is_active = True
        await department.save(update_fields=["deleted_at", "is_active"])
        return department

    def query_positions(self) -> QuerySet[Position]:
        return Position.all().order_by("sort", "name")

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
        return (
            await UserDepartment
            .filter(
                user_id=user_id,
                department__deleted_at__isnull=True,
            )
            .all()
            .order_by("-is_primary", "created_at")
        )

    def query_user_departments(self, *, user_id: UUID) -> QuerySet[UserDepartment]:
        return UserDepartment.filter(
            user_id=user_id,
            department__deleted_at__isnull=True,
        ).order_by("-is_primary", "created_at")

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

    def query_user_positions(self, *, user_id: UUID) -> QuerySet[UserPosition]:
        return UserPosition.filter(user_id=user_id).order_by("created_at")

    async def ensure_user_position(self, *, user_id: UUID, position_id: UUID) -> UserPosition:
        row, _ = await UserPosition.get_or_create(user_id=user_id, position_id=position_id)
        return row

    async def remove_user_position(self, *, user_id: UUID, position_id: UUID) -> int:
        return await UserPosition.filter(user_id=user_id, position_id=position_id).delete()
