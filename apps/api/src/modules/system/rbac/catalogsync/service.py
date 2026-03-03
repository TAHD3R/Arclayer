from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from pydantic import ValidationError

from apps.api.src.config import Settings
from apps.api.src.models.system.rbac import Permission, PermissionScope
from apps.api.src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from apps.api.src.modules.system.rbac.constants.service import CORE_PERMISSION_OWNER
from apps.api.src.modules.system.rbac.repository import RBACRepository
from apps.api.src.modules.system.rbac.schema import PermissionCatalogSyncResult
from apps.api.src.plugin.manager import PluginManager
from apps.api.src.plugin.manifest import PermissionTemplate, load_plugin_manifest


class RBACCatalogSyncMixin:
    settings: Settings
    repo: RBACRepository
    plugin_manager: PluginManager | None

    def _iter_permission_entries(self) -> Iterable[tuple[str, PermissionTemplate]]:
        for tpl in CORE_PERMISSION_TEMPLATES:
            yield (CORE_PERMISSION_OWNER, tpl)

        if not self.settings.plugin.enabled:
            return

        if self.plugin_manager is not None:
            if not self.plugin_manager.descriptors:
                self.plugin_manager.discover()
            for desc in self.plugin_manager.descriptors.values():
                for tpl in desc.manifest.permissions or []:
                    yield (desc.plugin_id, tpl)
            return

        root = Path(self.settings.plugin.root_dir)
        if not root.exists():
            return
        for manifest_path in root.glob("*/plugin.toml"):
            try:
                manifest = load_plugin_manifest(manifest_path)
            except (OSError, ValidationError):
                continue
            plugin_id = manifest.plugin.id
            for tpl in manifest.permissions or []:
                yield (plugin_id, tpl)

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
