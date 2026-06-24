from __future__ import annotations

from typing import TypedDict
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict
from src.modules.system.rbac.catalogsync.service import RBACCatalogSyncMixin
from src.modules.system.rbac.constants.service import (
    ROLE_ADMIN,
    ROLE_DESIGNER,
    ROLE_EDITOR,
    ROLE_OWNER,
    ROLE_VIEWER,
)
from src.modules.system.rbac.localization.service import _tr
from src.modules.system.rbac.repository import RBACRepository
from src.modules.system.rbac.schema import PermissionSyncResult, PermissionTemplate, WorkspacesSyncResult


class RBACWorkspacesMixin(RBACCatalogSyncMixin):
    settings: Settings
    repo: RBACRepository

    async def ensure_workspace_system_roles(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        class _RoleDefinition(TypedDict):
            code: str
            name: str
            description: str
            name_i18n: str
            description_i18n: str
            is_default: bool
            is_superuser: bool

        system_defs: list[_RoleDefinition] = [
            {
                "code": ROLE_OWNER,
                "name": "Owner",
                "description": "Full access within this workspace.",
                "name_i18n": "rbac:RBAC_ROLE_OWNER_NAME",
                "description_i18n": "rbac:RBAC_ROLE_OWNER_DESC",
                "is_default": False,
                "is_superuser": True,
            },
            {
                "code": ROLE_ADMIN,
                "name": "Admin",
                "description": "Workspace administration (team, settings, permissions).",
                "name_i18n": "rbac:RBAC_ROLE_ADMIN_NAME",
                "description_i18n": "rbac:RBAC_ROLE_ADMIN_DESC",
                "is_default": False,
                "is_superuser": False,
            },
            {
                "code": ROLE_EDITOR,
                "name": "Editor",
                "description": "Content editing and publishing.",
                "name_i18n": "rbac:RBAC_ROLE_EDITOR_NAME",
                "description_i18n": "rbac:RBAC_ROLE_EDITOR_DESC",
                "is_default": False,
                "is_superuser": False,
            },
            {
                "code": ROLE_DESIGNER,
                "name": "Designer",
                "description": "Design and presentation management.",
                "name_i18n": "rbac:RBAC_ROLE_DESIGNER_NAME",
                "description_i18n": "rbac:RBAC_ROLE_DESIGNER_DESC",
                "is_default": False,
                "is_superuser": False,
            },
            {
                "code": ROLE_VIEWER,
                "name": "Viewer",
                "description": "Read-only access to the admin console.",
                "name_i18n": "rbac:RBAC_ROLE_VIEWER_NAME",
                "description_i18n": "rbac:RBAC_ROLE_VIEWER_DESC",
                "is_default": True,
                "is_superuser": False,
            },
        ]

        for d in system_defs:
            existing = await self.repo.get_role_by_code(workspace_id=workspace_id, code=d["code"], conn=conn)
            if existing is None:
                await self.repo.create_role(
                    workspace_id=workspace_id,
                    code=d["code"],
                    name=d["name"],
                    description=d["description"],
                    name_i18n=d["name_i18n"],
                    description_i18n=d["description_i18n"],
                    is_system=True,
                    is_default=bool(d["is_default"]),
                    is_superuser=bool(d["is_superuser"]),
                    conn=conn,
                )
                continue

            if not bool(existing.is_system):
                raise Conflict(
                    message=_tr("ROLE_CODE_RESERVED", "角色编码已被系统保留"),
                    error="ROLE_CODE_RESERVED",
                    meta={"code": d["code"]},
                )

            updates: dict[str, object] = {}
            for k in ("name", "description", "name_i18n", "description_i18n", "is_default", "is_superuser"):
                if getattr(existing, k) != d[k]:
                    updates[k] = d[k]
            if not existing.is_system:
                updates["is_system"] = True
            if updates:
                await self.repo.update_role(existing, updates=updates, conn=conn)

    async def ensure_workspace_system_role_grants(self, *, workspace_id: UUID) -> None:
        await self.ensure_workspace_system_roles(workspace_id=workspace_id)

        roles = await self.repo.list_roles(workspace_id=workspace_id)
        system_roles = {r.code: r for r in roles if r.is_system}

        desired_by_role: dict[str, set[str]] = {code: set() for code in system_roles.keys()}
        templates: dict[str, PermissionTemplate] = {}
        for _owner_key, tpl in self._iter_permission_entries():
            code = tpl.code
            if not code or code in templates:
                continue
            templates[code] = tpl

        for perm_code, tpl in templates.items():
            raw_scope = (getattr(tpl, "scope", None) or "workspace").strip().lower()
            if raw_scope != "workspace":
                continue
            default_roles = sorted({str(x).strip() for x in (tpl.default_roles or []) if x and str(x).strip()})
            for role_code in default_roles:
                if role_code in desired_by_role:
                    desired_by_role[role_code].add(perm_code)

        for role_code, role in system_roles.items():
            desired_codes = sorted(desired_by_role.get(role_code) or [])
            perms = await self.repo.list_permissions_by_codes(codes=desired_codes)
            perm_ids = [UUID(str(p.id)) for p in perms]
            await self.repo.replace_role_permissions(role=role, permission_ids=perm_ids)

    async def ensure_all_workspaces_ready(self) -> WorkspacesSyncResult:
        workspaces = await self.repo.list_workspace_ids()
        total = 0
        for ws_id in workspaces:
            total += 1
            await self.ensure_workspace_system_role_grants(workspace_id=ws_id)
        return WorkspacesSyncResult(workspaces=total)

    async def sync_permissions_with_workspaces(self) -> PermissionSyncResult:
        catalog = await self.sync_permission_catalog()
        workspaces = await self.ensure_all_workspaces_ready()
        return PermissionSyncResult(
            total=catalog.total,
            created=catalog.created,
            updated=catalog.updated,
            workspaces=workspaces.workspaces,
        )
