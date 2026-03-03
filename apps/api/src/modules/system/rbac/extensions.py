from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from apps.api.src.plugin.host import host

# Keep the extension point: even after RBAC is core, plugins may still want to contribute roles
# (e.g. future "public users", feature flags, or other domain bridges).


class RBACRoleResolver(Protocol):
    async def get_role_codes(self, *, user_id: UUID, organization_id: UUID) -> list[str]: ...


def get_role_resolvers() -> list[RBACRoleResolver]:
    raw = host.hook.rbac_role_resolvers()
    resolvers: list[RBACRoleResolver] = []
    for part in raw or []:
        if part is None:
            continue
        if isinstance(part, list):
            resolvers.extend(cast(list[RBACRoleResolver], part))
            continue
        resolvers.append(cast(RBACRoleResolver, part))
    return resolvers
