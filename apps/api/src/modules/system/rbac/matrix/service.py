from __future__ import annotations

from uuid import UUID

from src.models.system.rbac import PermissionScope
from src.modules.system.rbac.repository import RBACRepository
from src.modules.system.rbac.schema import RBACMatrixPayload


class RBACMatrixMixin:
    repo: RBACRepository

    async def ensure_workspace_system_roles(self, *, workspace_id: UUID) -> None: ...

    async def get_matrix(self, *, workspace_id: UUID) -> RBACMatrixPayload:
        await self.ensure_workspace_system_roles(workspace_id=workspace_id)

        roles = await self.repo.list_roles(workspace_id=workspace_id)
        permissions = await self.repo.list_permissions(scope=PermissionScope.WORKSPACE)
        edges = await self.repo.list_role_permission_edges_for_workspace(workspace_id=workspace_id)

        superuser_codes = {r.code for r in roles if r.is_superuser}
        grants: dict[str, set[str]] = {}
        for perm_code, role_code in edges:
            grants.setdefault(perm_code, set()).add(role_code)

        if superuser_codes:
            for p in permissions:
                grants.setdefault(p.code, set()).update(superuser_codes)

        return RBACMatrixPayload(
            roles=list(roles),
            permissions=list(permissions),
            grants={k: sorted(v) for k, v in grants.items()},
        )
