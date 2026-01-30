from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.common.constants.rbac import RBAC_ROLE_RESOLVER_EXTENSION_POINT
from apps.api.plugin.registry import ExtensionPointType, registry

# Keep the extension point: even after RBAC is core, plugins may still want to contribute roles
# (e.g. future "public users", feature flags, or other domain bridges).


class RBACRoleResolver(Protocol):
    async def get_role_codes(self, *, user_id: UUID, organization_id: UUID) -> list[str]: ...


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
