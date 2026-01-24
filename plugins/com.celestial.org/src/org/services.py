from __future__ import annotations

from typing import Any
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.core.i18n import t
from apps.api.models.user import User
from org.repository import OrgRepository


def _tr(key: str, default: str) -> str:
    return t("org", key, default=default)


class OrgService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrgRepository()

    async def list_departments(self):
        return await self.repo.list_departments()

    async def create_department(self, payload: dict[str, Any]):
        code = payload.get("code")
        if code:
            existing = await self.repo.get_department_by_code(str(code))
            if existing is not None:
                raise Conflict(message=_tr("DEPARTMENT_CODE_EXISTS", "部门编码已存在"), error="DEPARTMENT_CODE_EXISTS")
        parent_id = payload.get("parent_id")
        if parent_id:
            parent = await self.repo.get_department(UUID(str(parent_id)))
            if parent is None:
                raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
        return await self.repo.create_department(
            code=code,
            name=str(payload["name"]),
            parent_id=parent_id,
            sort=int(payload.get("sort", 0)),
            is_active=bool(payload.get("is_active", True)),
            description=payload.get("description"),
        )

    async def update_department(self, *, department_id: UUID, payload: dict[str, Any]):
        department = await self.repo.get_department(department_id)
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")

        updates: dict[str, Any] = {}
        if "name" in payload and payload["name"] is not None:
            updates["name"] = payload["name"]
        if "sort" in payload and payload["sort"] is not None:
            updates["sort"] = payload["sort"]
        if "is_active" in payload and payload["is_active"] is not None:
            updates["is_active"] = payload["is_active"]
        if "description" in payload:
            updates["description"] = payload.get("description")
        if "parent_id" in payload:
            parent_id = payload.get("parent_id")
            if parent_id == department_id:
                raise BadRequest(message=_tr("INVALID_PARENT", "父部门不合法"), error="INVALID_PARENT")
            if parent_id:
                parent = await self.repo.get_department(UUID(str(parent_id)))
                if parent is None:
                    raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
            updates["parent_id"] = parent_id

        return await self.repo.update_department(department, updates=updates)

    async def delete_department(self, *, department_id: UUID) -> None:
        department = await self.repo.get_department(department_id)
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
        if await self.repo.department_has_children(department_id):
            raise BadRequest(
                message=_tr("DEPARTMENT_HAS_CHILDREN", "部门下存在子部门，无法删除"),
                error="DEPARTMENT_HAS_CHILDREN",
            )
        await self.repo.delete_department(department_id)

    async def list_positions(self):
        return await self.repo.list_positions()

    async def create_position(self, payload: dict[str, Any]):
        existing = await self.repo.get_position_by_code(str(payload["code"]))
        if existing is not None:
            raise Conflict(message=_tr("POSITION_CODE_EXISTS", "岗位编码已存在"), error="POSITION_CODE_EXISTS")
        return await self.repo.create_position(
            code=str(payload["code"]),
            name=str(payload["name"]),
            sort=int(payload.get("sort", 0)),
            is_active=bool(payload.get("is_active", True)),
            description=payload.get("description"),
        )

    async def update_position(self, *, position_id: UUID, payload: dict[str, Any]):
        position = await self.repo.get_position(position_id)
        if position is None:
            raise NotFound(message=_tr("POSITION_NOT_FOUND", "岗位不存在"), error="POSITION_NOT_FOUND")

        updates: dict[str, Any] = {}
        if "name" in payload and payload["name"] is not None:
            updates["name"] = payload["name"]
        if "sort" in payload and payload["sort"] is not None:
            updates["sort"] = payload["sort"]
        if "is_active" in payload and payload["is_active"] is not None:
            updates["is_active"] = payload["is_active"]
        if "description" in payload:
            updates["description"] = payload.get("description")

        return await self.repo.update_position(position, updates=updates)

    async def delete_position(self, *, position_id: UUID) -> None:
        position = await self.repo.get_position(position_id)
        if position is None:
            raise NotFound(message=_tr("POSITION_NOT_FOUND", "岗位不存在"), error="POSITION_NOT_FOUND")
        await self.repo.delete_position(position_id)

    async def list_user_departments(self, *, user_id: UUID):
        await self._ensure_user(user_id)
        return await self.repo.list_user_departments(user_id=user_id)

    async def assign_user_department(self, *, user_id: UUID, department_id: UUID, primary: bool = False) -> None:
        await self._ensure_user(user_id)
        department = await self.repo.get_department(department_id)
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
        await self.repo.ensure_user_department(user_id=user_id, department_id=department_id)
        if primary:
            await self.repo.set_primary_department(user_id=user_id, department_id=department_id)
        else:
            # If this is the first department for the user, auto set primary.
            items = await self.repo.list_user_departments(user_id=user_id)
            if items and not any(item.is_primary for item in items):
                await self.repo.set_primary_department(user_id=user_id, department_id=items[0].department_id)

    async def revoke_user_department(self, *, user_id: UUID, department_id: UUID) -> None:
        await self._ensure_user(user_id)
        await self.repo.remove_user_department(user_id=user_id, department_id=department_id)
        items = await self.repo.list_user_departments(user_id=user_id)
        if items and not any(item.is_primary for item in items):
            await self.repo.set_primary_department(user_id=user_id, department_id=items[0].department_id)

    async def set_primary_department(self, *, user_id: UUID, department_id: UUID) -> None:
        await self._ensure_user(user_id)
        department = await self.repo.get_department(department_id)
        if department is None:
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")
        items = await self.repo.list_user_departments(user_id=user_id)
        if not any(item.department_id == department_id for item in items):
            raise BadRequest(
                message=_tr("USER_DEPARTMENT_MISSING", "用户不在该部门中"),
                error="USER_DEPARTMENT_MISSING",
            )
        await self.repo.set_primary_department(user_id=user_id, department_id=department_id)

    async def list_user_positions(self, *, user_id: UUID):
        await self._ensure_user(user_id)
        return await self.repo.list_user_positions(user_id=user_id)

    async def assign_user_position(self, *, user_id: UUID, position_id: UUID) -> None:
        await self._ensure_user(user_id)
        position = await self.repo.get_position(position_id)
        if position is None:
            raise NotFound(message=_tr("POSITION_NOT_FOUND", "岗位不存在"), error="POSITION_NOT_FOUND")
        await self.repo.ensure_user_position(user_id=user_id, position_id=position_id)

    async def revoke_user_position(self, *, user_id: UUID, position_id: UUID) -> None:
        await self._ensure_user(user_id)
        await self.repo.remove_user_position(user_id=user_id, position_id=position_id)

    async def _ensure_user(self, user_id: UUID) -> User:
        user = await User.get_or_none(id=user_id)
        if user is None:
            raise NotFound(message=_tr("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")
        return user
