from __future__ import annotations

from uuid import UUID

from org.models import Department, Position
from rbac.models import Role

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import NotFound
from apps.api.core.i18n import t
from rbac_org.repository import RBACOrgRepository


def _tr(key: str, default: str) -> str:
    return t("rbac_org", key, default=default)


class RBACOrgService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = RBACOrgRepository()

    async def _require_position(self, *, position_id: UUID) -> None:
        if not await Position.filter(id=position_id).exists():
            raise NotFound(message=_tr("POSITION_NOT_FOUND", "岗位不存在"), error="POSITION_NOT_FOUND")

    async def _require_department(self, *, department_id: UUID) -> None:
        if not await Department.filter(id=department_id).exists():
            raise NotFound(message=_tr("DEPARTMENT_NOT_FOUND", "部门不存在"), error="DEPARTMENT_NOT_FOUND")

    async def _require_roles(self, *, role_codes: list[str]) -> list[Role]:
        unique = sorted({code for code in role_codes if code})
        if not unique:
            return []
        rows = await Role.filter(code__in=unique).all()
        found = {r.code for r in rows}
        missing = [code for code in unique if code not in found]
        if missing:
            raise NotFound(
                message=_tr("ROLE_NOT_FOUND", "角色不存在"),
                error="ROLE_NOT_FOUND",
                details={"missing": missing},
            )
        return rows

    async def list_position_roles(self, *, position_id: UUID) -> list[Role]:
        await self._require_position(position_id=position_id)
        return await self.repo.list_position_roles(position_id=position_id)

    async def set_position_roles(self, *, position_id: UUID, role_codes: list[str]) -> None:
        await self._require_position(position_id=position_id)
        roles = await self._require_roles(role_codes=role_codes)
        await self.repo.replace_position_roles(position_id=position_id, role_ids=[r.id for r in roles])

    async def add_position_role(self, *, position_id: UUID, role_code: str) -> None:
        await self._require_position(position_id=position_id)
        roles = await self._require_roles(role_codes=[role_code])
        await self.repo.add_position_role(position_id=position_id, role_id=roles[0].id)

    async def remove_position_role(self, *, position_id: UUID, role_code: str) -> None:
        await self._require_position(position_id=position_id)
        role = await Role.get_or_none(code=role_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        await self.repo.remove_position_role(position_id=position_id, role_id=role.id)

    async def list_department_roles(self, *, department_id: UUID) -> list[Role]:
        await self._require_department(department_id=department_id)
        return await self.repo.list_department_roles(department_id=department_id)

    async def set_department_roles(self, *, department_id: UUID, role_codes: list[str]) -> None:
        await self._require_department(department_id=department_id)
        roles = await self._require_roles(role_codes=role_codes)
        await self.repo.replace_department_roles(department_id=department_id, role_ids=[r.id for r in roles])

    async def add_department_role(self, *, department_id: UUID, role_code: str) -> None:
        await self._require_department(department_id=department_id)
        roles = await self._require_roles(role_codes=[role_code])
        await self.repo.add_department_role(department_id=department_id, role_id=roles[0].id)

    async def remove_department_role(self, *, department_id: UUID, role_code: str) -> None:
        await self._require_department(department_id=department_id)
        role = await Role.get_or_none(code=role_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        await self.repo.remove_department_role(department_id=department_id, role_id=role.id)

    async def resolve_role_codes(self, *, user_id: UUID) -> list[str]:
        # Used by the RBAC role-resolver extension.
        codes: set[str] = set()
        codes.update(await self.repo.list_role_codes_for_user_positions(user_id=user_id))
        codes.update(await self.repo.list_role_codes_for_user_departments(user_id=user_id))
        return sorted(codes)
