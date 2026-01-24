from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.http.pagination import PageData, PageParams
from apps.api.plugin.registry import ExtensionPointType, registry

ADMIN_RBAC_ORG_PROVIDER_EXTENSION_POINT = "admin-rbac-org-provider"


class AdminRBACOrgProvider(Protocol):
    async def list_position_roles(self, *, position_id: UUID, params: PageParams) -> PageData: ...

    async def set_position_roles(self, *, position_id: UUID, role_codes: list[str]) -> None: ...

    async def add_position_role(self, *, position_id: UUID, role_code: str) -> None: ...

    async def remove_position_role(self, *, position_id: UUID, role_code: str) -> None: ...

    async def list_department_roles(self, *, department_id: UUID, params: PageParams) -> PageData: ...

    async def set_department_roles(self, *, department_id: UUID, role_codes: list[str]) -> None: ...

    async def add_department_role(self, *, department_id: UUID, role_code: str) -> None: ...

    async def remove_department_role(self, *, department_id: UUID, role_code: str) -> None: ...


def _register_admin_rbac_org_extension_point() -> None:
    registry.register_extension_point(
        ADMIN_RBAC_ORG_PROVIDER_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Admin RBAC-Org bridge provider (bind roles to positions/departments).",
    )


_register_admin_rbac_org_extension_point()


def get_admin_rbac_org_provider() -> AdminRBACOrgProvider | None:
    provider = registry.get_extension(ADMIN_RBAC_ORG_PROVIDER_EXTENSION_POINT)
    return cast(AdminRBACOrgProvider | None, provider)
