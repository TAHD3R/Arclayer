from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.http.pagination import PageData, PageParams
from apps.api.plugin.registry import ExtensionPointType, registry

ADMIN_RBAC_PROVIDER_EXTENSION_POINT = "admin-rbac-provider"


class AdminRBACProvider(Protocol):
    # Roles
    async def list_roles(self, *, params: PageParams) -> PageData: ...

    async def get_role(self, *, role_code: str): ...

    async def create_role(self, *, payload): ...

    async def update_role(self, *, role_code: str, payload): ...

    async def delete_role(self, *, role_code: str) -> None: ...

    # Permissions
    async def list_permissions(self, *, params: PageParams) -> PageData: ...

    async def sync_permissions(self): ...

    # Role permissions
    async def list_role_permissions(self, *, role_code: str, params: PageParams) -> PageData: ...

    async def set_role_permissions(self, *, role_code: str, permission_codes: list[str]) -> None: ...

    # User roles
    async def list_user_roles(self, *, user_id: UUID, params: PageParams) -> PageData: ...

    async def assign_user_role(self, *, user_id: UUID, role_code: str) -> None: ...

    async def revoke_user_role(self, *, user_id: UUID, role_code: str) -> None: ...


def _register_admin_rbac_extension_point() -> None:
    registry.register_extension_point(
        ADMIN_RBAC_PROVIDER_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Admin RBAC provider (roles/permissions/user-role management).",
    )


_register_admin_rbac_extension_point()


def get_admin_rbac_provider() -> AdminRBACProvider | None:
    provider = registry.get_extension(ADMIN_RBAC_PROVIDER_EXTENSION_POINT)
    return cast(AdminRBACProvider | None, provider)
