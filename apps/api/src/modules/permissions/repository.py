from __future__ import annotations

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.modules.permissions.conditions import PermissionConditionTemplate, build_permission_condition_templates


class PermissionsRepository(TortoiseORMRepository):
    async def list_condition_templates(self) -> tuple[PermissionConditionTemplate, ...]:
        return build_permission_condition_templates()
