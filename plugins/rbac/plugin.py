from __future__ import annotations

from apps.api.core.logging import get_logger
from apps.api.plugin.types import BasePlugin
from rbac.models import Permission, Role, RolePermission

logger = get_logger(__name__)


class RBACPlugin(BasePlugin):
    async def on_start(self) -> None:
        await self._ensure_default_role()
        await self._sync_permissions()

    async def _ensure_default_role(self) -> None:
        config = self.descriptor.config or {}
        default_role = config.get("general", {}).get("default_role")
        if not default_role:
            return
        role, created = await Role.get_or_create(
            code=default_role,
            defaults={"name": default_role, "is_default": True},
        )
        if not created and not role.is_default:
            role.is_default = True
            await role.save()

    async def _sync_permissions(self) -> None:
        for template in self.descriptor.manifest.permissions:
            permission, created = await Permission.get_or_create(
                code=template.code,
                defaults={
                    "name": template.name,
                    "description": template.description,
                    "plugin_id": self.plugin_id,
                },
            )
            if not created:
                changed = False
                if permission.name != template.name:
                    permission.name = template.name
                    changed = True
                if permission.description != template.description:
                    permission.description = template.description
                    changed = True
                if permission.plugin_id != self.plugin_id:
                    permission.plugin_id = self.plugin_id
                    changed = True
                if changed:
                    await permission.save()

            for role_code in template.default_roles:
                role, _ = await Role.get_or_create(
                    code=role_code,
                    defaults={"name": role_code, "is_default": True},
                )
                await RolePermission.get_or_create(role=role, permission=permission)

        logger.info("RBAC permissions synced", plugin_id=self.plugin_id)
