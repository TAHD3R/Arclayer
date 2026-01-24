from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.plugin.registry import ExtensionPointType, registry

# Role resolver extensions allow other plugins (e.g. org bridge) to contribute
# additional roles for a user. RBAC Core will treat the union of direct user roles
# and resolved roles as "effective roles" for permission checks and snapshots.
RBAC_ROLE_RESOLVER_EXTENSION_POINT = "rbac-role-resolver"


class RBACRoleResolver(Protocol):
    async def get_role_codes(self, *, user_id: UUID) -> list[str]: ...


def _register_rbac_extension_points() -> None:
    registry.register_extension_point(
        RBAC_ROLE_RESOLVER_EXTENSION_POINT,
        ExtensionPointType.MULTI_INSTANCE,
        description="Resolves additional RBAC role codes for a user (effective roles).",
    )


_register_rbac_extension_points()


def get_role_resolvers() -> list[RBACRoleResolver]:
    resolvers = registry.get_extension(RBAC_ROLE_RESOLVER_EXTENSION_POINT) or []
    return cast(list[RBACRoleResolver], resolvers)
