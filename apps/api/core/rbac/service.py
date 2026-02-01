from __future__ import annotations

from typing import Any

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.core.i18n import t
from apps.api.core.rbac.constants import (
    CORE_PERMISSION_OWNER,
    ROLE_ADMIN,
    ROLE_ARCHITECT,
    ROLE_EDITOR,
    ROLE_OWNER,
    ROLE_USER,
    ROLE_VIEWER,
)
from apps.api.core.rbac.repository import RBACRepository
from apps.api.plugin.registry import registry


def _tr(key: str, default: str) -> str:
    return t("rbac", key, default=default)


class RBACService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = RBACRepository()

    async def ensure_system_roles(self) -> None:
        await self.repo.get_or_create_role(
            code=ROLE_OWNER,
            name="Owner",
            is_default=False,
            is_superuser=True,
            description="Full access. Root authority for the organization.",
        )
        await self.repo.get_or_create_role(
            code=ROLE_ADMIN,
            name="Admin",
            is_default=False,
            is_superuser=False,
            description="Global management (excluding finance and destructive operations).",
        )
        await self.repo.get_or_create_role(
            code=ROLE_ARCHITECT,
            name="Architect",
            is_default=False,
            is_superuser=False,
            description="Focus on modeling and system structure. Can manage plugins.",
        )
        await self.repo.get_or_create_role(
            code=ROLE_EDITOR,
            name="Editor",
            is_default=False,
            is_superuser=False,
            description="Content management and publishing.",
        )
        await self.repo.get_or_create_role(
            code=ROLE_VIEWER,
            name="Viewer",
            is_default=True,
            is_superuser=False,
            description="Read-only access to the admin console.",
        )
        # Legacy role (kept for backward compatibility; not used as the default onboarding role).
        await self.repo.get_or_create_role(
            code=ROLE_USER,
            name="User",
            is_default=False,
            is_superuser=False,
            description="Legacy role (deprecated).",
        )

    async def list_roles_paginated(self, *, params: PageParams, out_schema: type[Any]) -> PageData[Any]:
        qs = self.repo.query_roles()
        return await paginate_queryset(qs, params=params, out_schema=out_schema)

    async def get_role(self, *, role_code: str):
        role = await self.repo.get_role_by_code(role_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        return role

    async def create_role(
        self,
        *,
        code: str,
        name: str,
        description: str | None,
        is_default: bool,
        is_superuser: bool,
    ):
        existing = await self.repo.get_role_by_code(code)
        if existing is not None:
            raise Conflict(message=_tr("ROLE_EXISTS", "角色编码已存在"), error="ROLE_EXISTS")
        return await self.repo.create_role(
            code=code,
            name=name,
            description=description,
            is_default=is_default,
            is_superuser=is_superuser,
        )

    async def update_role(self, *, role_code: str, payload: dict[str, Any]):
        role = await self.get_role(role_code=role_code)
        updates: dict[str, Any] = dict(payload or {})
        # Role code must never be modified.
        updates.pop("code", None)

        if role.code in (ROLE_OWNER, ROLE_ADMIN, ROLE_ARCHITECT, ROLE_EDITOR, ROLE_VIEWER, ROLE_USER):
            # Avoid turning system roles into unexpected authority.
            if "is_superuser" in updates or "is_default" in updates:
                raise BadRequest(
                    message=_tr("ROLE_UPDATE_INVALID", "不允许修改系统角色权限"),
                    error="ROLE_UPDATE_INVALID",
                )

        if not updates:
            return role
        return await self.repo.update_role(role, updates=updates)

    async def delete_role(self, *, role_code: str) -> None:
        role = await self.get_role(role_code=role_code)
        if role.code in (ROLE_OWNER, ROLE_ADMIN, ROLE_ARCHITECT, ROLE_EDITOR, ROLE_VIEWER, ROLE_USER):
            raise BadRequest(message=_tr("ROLE_DELETE_INVALID", "不允许删除系统角色"), error="ROLE_DELETE_INVALID")
        await self.repo.delete_role(role)

    async def list_permissions_paginated(self, *, params: PageParams, out_schema: type[Any]) -> PageData[Any]:
        qs = self.repo.query_permissions()
        return await paginate_queryset(qs, params=params, out_schema=out_schema)

    async def list_role_permissions_paginated(
        self,
        *,
        role_code: str,
        params: PageParams,
        out_schema: type[Any],
    ) -> PageData[Any]:
        role = await self.get_role(role_code=role_code)
        qs = self.repo.query_permissions().filter(permission_roles__role_id=role.id)
        return await paginate_queryset(qs, params=params, out_schema=out_schema)

    async def set_role_permissions(self, *, role_code: str, permission_codes: list[str]) -> None:
        role = await self.get_role(role_code=role_code)
        codes = sorted({str(c).strip() for c in (permission_codes or []) if c and str(c).strip()})
        if not codes:
            await self.repo.replace_role_permissions(role=role, permission_ids=[])
            return

        perms = await self.repo.query_permissions().filter(code__in=codes).all()
        found = {p.code for p in perms}
        missing = [c for c in codes if c not in found]
        if missing:
            raise BadRequest(
                message=_tr("PERMISSION_NOT_FOUND", "权限不存在"),
                error="PERMISSION_NOT_FOUND",
                meta={"missing": missing},
            )
        await self.repo.replace_role_permissions(role=role, permission_ids=[p.id for p in perms])

    async def sync_permissions(self) -> dict[str, Any]:
        """
        Sync permission templates (core + plugins) into DB and grant defaults.
        """

        await self.ensure_system_roles()
        role_map = {r.code: r for r in await self.repo.list_roles()}
        admin_role = role_map.get(ROLE_ADMIN)
        user_role = role_map.get(ROLE_USER)
        if admin_role is None:
            raise BadRequest(message=_tr("ROLE_NOT_READY", "系统角色未就绪"), error="ROLE_NOT_READY")

        created = 0
        updated = 0
        granted_admin = 0
        granted_user = 0

        # Registry entries come from:
        # - core: registered at startup with plugin_id="core"
        # - plugins: registered by PluginManager.start()
        templates: dict[str, Any] = {}
        for entry in registry.permissions:
            code = entry.template.code
            if code in templates:
                continue
            templates[code] = entry

        for code in sorted(templates.keys()):
            entry = templates[code]
            plugin_id = entry.plugin_id or CORE_PERMISSION_OWNER
            tpl = entry.template

            perm, is_created = await self.repo.get_or_create_permission(
                code=tpl.code,
                name=tpl.name,
                description=tpl.description,
                plugin_id=plugin_id,
            )
            if is_created:
                created += 1
            else:
                if await self.repo.update_permission(
                    perm,
                    name=tpl.name,
                    description=tpl.description,
                    plugin_id=plugin_id,
                ):
                    updated += 1

            # Grant default roles.
            defaults = sorted({str(x).strip() for x in (tpl.default_roles or []) if x and str(x).strip()})
            for role_code in defaults:
                role = role_map.get(role_code)
                if role is None:
                    # Unknown role code in template; ignore safely.
                    continue
                if await self.repo.ensure_role_permission(role=role, permission=perm):
                    if role_code == ROLE_ADMIN:
                        granted_admin += 1
                    elif role_code == ROLE_USER and user_role is not None:
                        granted_user += 1

        return {
            "total": len(templates),
            "created": created,
            "updated": updated,
            "granted_admin": granted_admin,
            "granted_user": granted_user,
        }
