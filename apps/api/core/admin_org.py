from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.http.pagination import PageData, PageParams
from apps.api.plugin.registry import ExtensionPointType, registry

ADMIN_ORG_PROVIDER_EXTENSION_POINT = "admin-org-provider"


class AdminOrgProvider(Protocol):
    # Departments
    async def list_departments(self, *, params: PageParams) -> PageData: ...

    async def get_department(self, *, department_id: UUID): ...

    async def create_department(self, *, payload): ...

    async def update_department(self, *, department_id: UUID, payload): ...

    async def delete_department(self, *, department_id: UUID) -> None: ...

    async def restore_department(self, *, department_id: UUID): ...

    # Positions
    async def list_positions(self, *, params: PageParams) -> PageData: ...

    async def get_position(self, *, position_id: UUID): ...

    async def create_position(self, *, payload): ...

    async def update_position(self, *, position_id: UUID, payload): ...

    async def delete_position(self, *, position_id: UUID) -> None: ...

    # Memberships
    async def list_user_departments(self, *, user_id: UUID, params: PageParams) -> PageData: ...

    async def assign_user_department(self, *, user_id: UUID, department_id: UUID, primary: bool) -> None: ...

    async def set_primary_department(self, *, user_id: UUID, department_id: UUID) -> None: ...

    async def revoke_user_department(self, *, user_id: UUID, department_id: UUID) -> None: ...

    async def list_user_positions(self, *, user_id: UUID, params: PageParams) -> PageData: ...

    async def assign_user_position(self, *, user_id: UUID, position_id: UUID) -> None: ...

    async def revoke_user_position(self, *, user_id: UUID, position_id: UUID) -> None: ...


def _register_admin_org_extension_point() -> None:
    registry.register_extension_point(
        ADMIN_ORG_PROVIDER_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Admin org management provider (departments/positions/memberships).",
    )


_register_admin_org_extension_point()


def get_admin_org_provider() -> AdminOrgProvider | None:
    provider = registry.get_extension(ADMIN_ORG_PROVIDER_EXTENSION_POINT)
    return cast(AdminOrgProvider | None, provider)
