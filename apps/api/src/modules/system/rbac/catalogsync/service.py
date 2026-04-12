from __future__ import annotations

from collections.abc import Iterable

from src.config import Settings
from src.models.system.rbac import Permission, PermissionScope
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from src.modules.system.rbac.constants.service import CORE_PERMISSION_OWNER
from src.modules.system.rbac.repository import RBACRepository
from src.modules.system.rbac.schema import PermissionCatalogSyncResult, PermissionTemplate


class RBACCatalogSyncMixin:
    settings: Settings
    repo: RBACRepository

    def _iter_permission_entries(self) -> Iterable[tuple[str, PermissionTemplate]]:
        for tpl in CORE_PERMISSION_TEMPLATES:
            yield (CORE_PERMISSION_OWNER, tpl)

    async def sync_permission_catalog(self) -> PermissionCatalogSyncResult:
        created = 0
        updated = 0

        templates: dict[str, tuple[str, PermissionTemplate]] = {}
        for plugin_id, tpl in self._iter_permission_entries():
            code = tpl.code
            if not code or code in templates:
                continue
            templates[code] = (plugin_id, tpl)

        for code in sorted(templates.keys()):
            plugin_id, tpl = templates[code]

            raw_scope = (getattr(tpl, "scope", None) or "workspace").strip().lower()
            scope = PermissionScope.ORG if raw_scope == "org" else PermissionScope.WORKSPACE

            perm, is_created = await self.repo.get_or_create_permission(
                code=tpl.code,
                scope=scope,
                name=tpl.name,
                description=tpl.description,
                name_i18n=tpl.name_i18n,
                description_i18n=tpl.description_i18n,
                plugin_id=plugin_id,
            )
            if is_created:
                created += 1
            else:
                if await self.repo.update_permission(
                    perm,
                    scope=scope,
                    name=tpl.name,
                    description=tpl.description,
                    name_i18n=tpl.name_i18n,
                    description_i18n=tpl.description_i18n,
                    plugin_id=plugin_id,
                ):
                    updated += 1

        known_codes = set(templates.keys())
        await Permission.exclude(code__in=list(known_codes)).delete()

        return PermissionCatalogSyncResult(total=len(templates), created=created, updated=updated)
