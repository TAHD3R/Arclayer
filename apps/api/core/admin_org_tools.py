from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.plugin.registry import ExtensionPointType, registry

ADMIN_ORG_TOOLS_PROVIDER_EXTENSION_POINT = "admin-org-tools-provider"


class AdminOrgToolsProvider(Protocol):
    async def validate(self): ...

    async def repair_directory(self, *, actor_user_id: UUID | None): ...

    async def repair_primary_department(self, *, actor_user_id: UUID | None): ...

    async def move_department(self, *, department_id: UUID, payload, actor_user_id: UUID | None) -> None: ...

    async def merge_department(self, *, department_id: UUID, payload, actor_user_id: UUID | None) -> None: ...

    async def reorder_departments(self, *, payload, actor_user_id: UUID | None) -> None: ...


def _register_admin_org_tools_extension_point() -> None:
    registry.register_extension_point(
        ADMIN_ORG_TOOLS_PROVIDER_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Admin org tools provider (validate/repair/move/merge/reorder).",
    )


_register_admin_org_tools_extension_point()


def get_admin_org_tools_provider() -> AdminOrgToolsProvider | None:
    provider = registry.get_extension(ADMIN_ORG_TOOLS_PROVIDER_EXTENSION_POINT)
    return cast(AdminOrgToolsProvider | None, provider)
