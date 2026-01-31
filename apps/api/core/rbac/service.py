from __future__ import annotations

from typing import Any
from uuid import UUID

from apps.api.common.schemas.authz_schema import AuthzSnapshot
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.core.i18n import t
from apps.api.core.organization.context import get_current_org_id as get_current_org_id_ctx
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

    async def list_user_roles_paginated(
        self, *, user_id: UUID, organization_id: UUID, params: PageParams, out_schema: type[Any]
    ) -> PageData[Any]:
        qs = self.repo.query_user_roles_in_org(user_id=user_id, organization_id=organization_id)
        return await paginate_queryset(qs, params=params, out_schema=out_schema)

    async def assign_role(self, *, user_id: UUID, organization_id: UUID, role_code: str) -> None:
        role = await self.repo.get_role_by_code(role_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        membership = await self.repo.ensure_membership(user_id=user_id, organization_id=organization_id)
        await self.repo.assign_membership_role(membership_id=membership.id, role=role)

    async def revoke_role(self, *, user_id: UUID, organization_id: UUID, role_code: str) -> None:
        role = await self.repo.get_role_by_code(role_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        membership = await self.repo.get_membership(user_id=user_id, organization_id=organization_id)
        if membership is None:
            raise NotFound(message=_tr("MEMBERSHIP_NOT_FOUND", "成员不存在"), error="MEMBERSHIP_NOT_FOUND")
        await self.repo.revoke_membership_role(membership_id=membership.id, role=role)

    async def list_effective_role_codes(self, *, user_id: UUID, organization_id: UUID) -> list[str]:
        # Keep behavior aligned with authz engine.
        from apps.api.core.rbac.extensions import get_role_resolvers

        role_codes = set(await self.repo.list_user_role_codes_in_org(user_id=user_id, organization_id=organization_id))
        for resolver in get_role_resolvers():
            try:
                extra = await resolver.get_role_codes(user_id=user_id, organization_id=organization_id)
            except Exception:
                continue
            if not extra:
                continue
            role_codes.update(str(code) for code in extra if code)
        return sorted(role_codes)

    async def get_authz_snapshot(self, *, user_id: UUID, organization_id: UUID | None = None) -> AuthzSnapshot:
        """
        Return org-scoped authz snapshot.

        If `organization_id` is not provided, it will try to read from request context.
        """

        org_id = organization_id or get_current_org_id_ctx()
        if org_id is None:
            return AuthzSnapshot(
                user_id=user_id,
                role_codes=[],
                permission_codes=[],
                is_superuser=False,
            )

        roles = await self.list_effective_role_codes(user_id=user_id, organization_id=org_id)
        is_superuser = await self.repo.role_codes_is_superuser(role_codes=roles)
        if is_superuser:
            perms = await self.repo.list_permissions()
            permission_codes = [p.code for p in perms]
        else:
            permission_codes = await self.repo.list_permission_codes_for_role_codes(role_codes=roles)
        return AuthzSnapshot(
            user_id=user_id,
            role_codes=roles,
            permission_codes=permission_codes,
            is_superuser=is_superuser,
        )

    async def bootstrap_admin(self, *, user_id: UUID, organization_id: UUID) -> dict[str, Any]:
        """
        One-time bootstrap: assign admin role to the given user when no admin exists.

        This is primarily used by the system setup flow.
        """

        state = await self.repo.get_bootstrap_state()
        if state.done:
            raise Conflict(message=_tr("BOOTSTRAP_DONE", "管理员初始化已完成"), error="BOOTSTRAP_DONE")
        if await self.repo.admin_binding_exists():
            raise Conflict(message=_tr("ADMIN_EXISTS", "已存在管理员"), error="ADMIN_EXISTS")

        await self.ensure_system_roles()
        admin_role = await self.repo.get_role_by_code(ROLE_ADMIN)
        if admin_role is None:
            raise BadRequest(message=_tr("ROLE_NOT_READY", "管理员角色未就绪"), error="ROLE_NOT_READY")

        membership = await self.repo.ensure_membership(user_id=user_id, organization_id=organization_id)
        await self.repo.assign_membership_role(membership_id=membership.id, role=admin_role)
        state = await self.repo.mark_bootstrap_done()
        return {
            "user_id": user_id,
            "organization_id": organization_id,
            "role_code": ROLE_ADMIN,
            "done_at": state.done_at,
        }

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
