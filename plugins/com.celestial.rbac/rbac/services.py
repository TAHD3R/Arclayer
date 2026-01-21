from __future__ import annotations

from typing import Any
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from apps.api.core.i18n import t
from apps.api.core.logging import get_logger
from apps.api.models.plugin import PluginRecord
from apps.api.plugin.registry import registry
from rbac.constants import PLUGIN_ID, ROLE_ADMIN, ROLE_USER
from rbac.repository import RBACRepository

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

    async def list_permissions(self):
        return await self.repo.list_permissions()

    async def list_user_roles(self, *, user_id: UUID):
        return await self.repo.list_user_roles(user_id)

    async def is_admin(self, *, user_id: UUID) -> bool:
        return await self.repo.user_has_role(user_id=user_id, role_code=ROLE_ADMIN)

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

    async def sync_permissions(self) -> dict[str, int]:
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
        return {
            "total": len(templates),
            "created": created,
            "updated": updated,
            "granted_admin": granted_admin,
            "granted_user": granted_user,
        }
