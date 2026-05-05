from __future__ import annotations

from src.config import Settings
from src.core.services import BaseService
from src.modules.permissions.repository import PermissionsRepository
from src.modules.permissions.schema import PermissionConditionTemplateOut


class PermissionsService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = PermissionsRepository()

    async def list_condition_templates(self) -> list[PermissionConditionTemplateOut]:
        templates = await self.repo.list_condition_templates()
        return [PermissionConditionTemplateOut.model_validate(template) for template in templates]
