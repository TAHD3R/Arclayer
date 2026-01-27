from __future__ import annotations

from typing import Any
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from apps.api.core.i18n import t
from apps.api.core.logging import get_logger
from apps.api.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.models.plugin import PluginRecord
from apps.api.plugin.registry import registry
from rbac.constants import PLUGIN_ID, ROLE_ADMIN, ROLE_USER
from rbac.extensions import get_role_resolvers
from rbac.repository import RBACRepository
from rbac.schema import AuthzSnapshot, PermissionOut, RoleOut, SyncResult

logger = get_logger(__name__)


def _get_bool(config: dict[str, Any], section: str, key: str, default: bool) -> bool:
    values = config.get(section, {})
    if not isinstance(values, dict):
        return default
    value = values.get(key)
    if value is None:
        return default
    return bool(value)


def _tr(key: str, default: str) -> str:
    return t("rbac", key, default=default)


class RBACService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = RBACRepository()
        self._config_cache: dict[str, Any] | None = None

    async def _get_config(self) -> dict[str, Any]:
        if self._config_cache is not None:
            return self._config_cache
        record = await PluginRecord.get_or_none(plugin_id=PLUGIN_ID)
        config = record.config if record and isinstance(record.config, dict) else {}
        self._config_cache = config
        return config

    async def ensure_system_roles(self) -> None:
        await self.repo.get_or_create_role(
            code=ROLE_ADMIN,
            name="Administrator",
            is_default=False,
            is_superuser=True,
        )
        await self.repo.get_or_create_role(
            code=ROLE_USER,
            name="User",
            is_default=True,
            is_superuser=False,
        )

    async def list_roles(self):
        return await self.repo.list_roles()

    async def list_roles_paginated(self, *, params: PageParams) -> PageData[RoleOut]:
        qs = self.repo.query_roles()
        return await paginate_queryset(qs, params=params, out_schema=RoleOut)

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

    async def update_role(
        self,
        *,
        role_code: str,
        payload: dict[str, Any],
    ):
        role = await self.get_role(role_code=role_code)
        updates: dict[str, Any] = dict(payload or {})
        # Role code must never be modified.
        updates.pop("code", None)

        if role.code in (ROLE_ADMIN, ROLE_USER):
            # Avoid turning system roles into unexpected authority. Name/description changes are OK.
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
        if role.code in (ROLE_ADMIN, ROLE_USER):
            raise BadRequest(message=_tr("ROLE_DELETE_FORBIDDEN", "不允许删除系统角色"), error="ROLE_DELETE_FORBIDDEN")
        await self.repo.delete_role(role)

    async def list_permissions(self):
        return await self.repo.list_permissions()

    async def list_permissions_paginated(self, *, params: PageParams) -> PageData[PermissionOut]:
        qs = self.repo.query_permissions()
        return await paginate_queryset(qs, params=params, out_schema=PermissionOut)

    async def list_role_permissions(self, *, role_code: str):
        role = await self.get_role(role_code=role_code)
        return await self.repo.list_role_permissions(role_id=role.id)

    async def list_role_permissions_paginated(self, *, role_code: str, params: PageParams) -> PageData[PermissionOut]:
        role = await self.get_role(role_code=role_code)
        # Role permissions are still a QuerySet of Permission via relation filtering.
        qs = self.repo.query_permissions().filter(permission_roles__role_id=role.id)
        return await paginate_queryset(qs, params=params, out_schema=PermissionOut)

    async def set_role_permissions(self, *, role_code: str, permission_codes: list[str]) -> None:
        role = await self.get_role(role_code=role_code)
        if role.code in (ROLE_ADMIN, ROLE_USER):
            raise BadRequest(
                message=_tr("ROLE_UPDATE_INVALID", "不允许修改系统角色权限"),
                error="ROLE_UPDATE_INVALID",
            )
        unique = sorted(set(permission_codes))
        ids: list[Any] = []
        for code in unique:
            perm = await self.repo.get_permission_by_code(code)
            if perm is None:
                raise NotFound(message=_tr("PERMISSION_NOT_FOUND", "权限不存在"), error="PERMISSION_NOT_FOUND")
            ids.append(perm.id)
        await self.repo.replace_role_permissions(role=role, permission_ids=ids)

    async def list_user_roles(self, *, user_id: UUID):
        return await self.repo.list_user_roles(user_id)

    async def list_user_roles_paginated(self, *, user_id: UUID, params: PageParams) -> PageData[RoleOut]:
        qs = self.repo.query_user_roles(user_id=user_id)
        return await paginate_queryset(qs, params=params, out_schema=RoleOut)

    async def is_admin(self, *, user_id: UUID) -> bool:
        return await self.repo.user_has_role(user_id=user_id, role_code=ROLE_ADMIN)

    async def list_effective_role_codes(self, *, user_id: UUID) -> list[str]:
        # Effective roles = direct user roles + roles resolved by extensions (e.g. org bridge).
        role_codes = set(await self.repo.list_user_role_codes(user_id=user_id))
        for resolver in get_role_resolvers():
            try:
                extra = await resolver.get_role_codes(user_id=user_id)
            except Exception as exc:
                # Fail closed: ignore resolver output on error to avoid privilege escalation.
                logger.warning("RBAC role resolver failed", error=str(exc))
                continue
            if not extra:
                continue
            role_codes.update(str(code) for code in extra if code)
        return sorted(role_codes)

    async def get_my_authz(self, *, user_id: UUID) -> AuthzSnapshot:
        roles = await self.list_effective_role_codes(user_id=user_id)
        is_superuser = await self.repo.role_codes_is_superuser(role_codes=roles)
        if is_superuser:
            # For superuser, return all codes for UI convenience.
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

    async def assign_role(self, *, user_id: UUID, role_code: str) -> None:
        role = await self.repo.get_role_by_code(role_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        await self.repo.assign_role(user_id=user_id, role=role)

    async def revoke_role(self, *, user_id: UUID, role_code: str) -> None:
        role = await self.repo.get_role_by_code(role_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        await self.repo.revoke_role(user_id=user_id, role=role)

    async def bootstrap_admin(self, *, user_id: UUID) -> dict[str, Any]:
        config = await self._get_config()
        if not _get_bool(config, "general", "bootstrap_enabled", True):
            raise Forbidden(
                message=_tr("BOOTSTRAP_DISABLED", "管理员初始化已关闭"),
                error="BOOTSTRAP_DISABLED",
            )

        state = await self.repo.get_bootstrap_state()
        if state.done:
            raise Conflict(
                message=_tr("BOOTSTRAP_DONE", "管理员初始化已完成"),
                error="BOOTSTRAP_DONE",
            )
        if await self.repo.admin_binding_exists():
            raise Conflict(message=_tr("ADMIN_EXISTS", "已存在管理员"), error="ADMIN_EXISTS")

        await self.ensure_system_roles()
        admin_role = await self.repo.get_role_by_code(ROLE_ADMIN)
        if admin_role is None:
            raise BadRequest(
                message=_tr("ROLE_NOT_READY", "管理员角色未就绪"),
                error="ROLE_NOT_READY",
            )

        await self.repo.assign_role(user_id=user_id, role=admin_role)
        state = await self.repo.mark_bootstrap_done()
        return {
            "user_id": user_id,
            "role_code": ROLE_ADMIN,
            "done_at": state.done_at,
        }

    async def sync_permissions(self) -> SyncResult:
        await self.ensure_system_roles()
        admin_role = await self.repo.get_role_by_code(ROLE_ADMIN)
        user_role = await self.repo.get_role_by_code(ROLE_USER)
        if admin_role is None:
            raise BadRequest(
                message=_tr("ROLE_NOT_READY", "管理员角色未就绪"),
                error="ROLE_NOT_READY",
            )

        entries = registry.permissions
        templates: dict[str, Any] = {}
        for entry in entries:
            code = entry.template.code
            if code in templates:
                logger.warning("Duplicate permission code ignored", code=code)
                continue
            templates[code] = entry

        created = 0
        updated = 0
        granted_admin = 0
        granted_user = 0
        for entry in templates.values():
            template = entry.template
            permission, was_created = await self.repo.get_or_create_permission(
                code=template.code,
                name=template.name,
                description=template.description,
                plugin_id=entry.plugin_id,
            )
            if was_created:
                created += 1
            else:
                if await self.repo.update_permission(
                    permission,
                    name=template.name,
                    description=template.description,
                    plugin_id=entry.plugin_id,
                ):
                    updated += 1

            if await self.repo.ensure_role_permission(role=admin_role, permission=permission):
                granted_admin += 1

            if user_role is not None and ROLE_USER in template.default_roles:
                if await self.repo.ensure_role_permission(role=user_role, permission=permission):
                    granted_user += 1

        logger.info(
            "RBAC permissions synced",
            total=len(templates),
            created=created,
            updated=updated,
            granted_admin=granted_admin,
            granted_user=granted_user,
        )
        return SyncResult(
            total=len(templates),
            created=created,
            updated=updated,
            granted_admin=granted_admin,
            granted_user=granted_user,
        )
