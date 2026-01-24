from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.http.pagination import PageData, PageParams
from apps.api.plugin.registry import ExtensionPointType, registry

ADMIN_USERS_PROVIDER_EXTENSION_POINT = "admin-users-provider"


class AdminUsersProvider(Protocol):
    async def list_users(self, *, params: PageParams, filters) -> PageData: ...

    async def get_user(self, *, user_id: UUID): ...

    async def create_user(self, *, payload): ...

    async def update_user(self, *, user_id: UUID, payload): ...

    async def set_user_status(self, *, user_id: UUID, enabled: bool): ...

    async def reset_password(self, *, user_id: UUID, new_password: str): ...

    async def get_user_authz(self, *, user_id: UUID): ...


def _register_admin_users_extension_point() -> None:
    registry.register_extension_point(
        ADMIN_USERS_PROVIDER_EXTENSION_POINT,
        ExtensionPointType.SINGLETON,
        description="Admin users management provider (CRUD/list/search/reset password).",
    )


_register_admin_users_extension_point()


def get_admin_users_provider() -> AdminUsersProvider | None:
    provider = registry.get_extension(ADMIN_USERS_PROVIDER_EXTENSION_POINT)
    return cast(AdminUsersProvider | None, provider)
