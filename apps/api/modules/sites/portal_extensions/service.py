from __future__ import annotations

from typing import Any
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.modules.sites.portal_extensions.schema import PortalExtensionOut
from apps.api.modules.sites.repository import SitesRepository
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.types import PluginStatus


class PortalExtensionsService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self._repo = SitesRepository()

    async def _get_enabled_plugin_ids(self, *, workspace_id: UUID) -> set[str] | None:
        """
        Return enabled plugin ids for a workspace.

        Returns:
        - set[str]: enabled plugin ids (when workspace toggle table exists)
        - None: "unknown" (e.g. migration not applied yet); treat as "no workspace toggle" for compatibility.
        """

        try:
            from apps.api.modules.workspaces.plugins_center.models import WorkspacePluginState

            rows = await WorkspacePluginState.filter(workspace_id=workspace_id, enabled=True).values_list(
                "plugin_id", flat=True
            )
            return {str(x) for x in rows if x}
        except Exception:
            # Compatibility: during rollout, the workspace_plugins table may not exist yet.
            return None

    async def list_portal_extensions_for_site(
        self,
        *,
        site_id: str,
        mode: str,
        plugin_manager: PluginManager,
    ) -> list[PortalExtensionOut]:
        if not self.settings.database.enabled:
            return []

        site = await self._repo.get_site_by_id(site_id=site_id)
        workspace_id = UUID(str(site.workspace_id))

        enabled_plugin_ids = await self._get_enabled_plugin_ids(workspace_id=workspace_id)

        # Ensure descriptors/records are available.
        if not plugin_manager.descriptors:
            plugin_manager.discover()
        if self.settings.database.enabled and not plugin_manager.records:
            try:
                await plugin_manager.sync_records()
            except Exception:
                pass

        want_mode = (mode or "").strip().lower() or "public"

        items: list[PortalExtensionOut] = []
        for plugin_id, desc in plugin_manager.descriptors.items():
            if enabled_plugin_ids is not None and plugin_id not in enabled_plugin_ids:
                continue
            record = plugin_manager.records.get(plugin_id)
            if record is not None and record.status in {PluginStatus.DISABLED, PluginStatus.FAILED}:
                continue

            decls = list(getattr(desc.manifest, "portal_extensions", None) or [])
            for d in decls:
                kind_raw = str(getattr(d, "kind", "") or "").strip()
                kind = kind_raw if kind_raw in {"head_link", "head_script", "style"} else "unknown"

                permission_code = getattr(d, "permission_code", None)
                # Public mode: only allow permission-less extensions.
                if want_mode == "public" and permission_code:
                    continue

                meta: dict[str, Any] | None = None
                raw_meta = getattr(d, "meta", None)
                if isinstance(raw_meta, dict):
                    meta = raw_meta

                items.append(
                    PortalExtensionOut(
                        plugin_id=plugin_id,
                        id=str(getattr(d, "id", "")),
                        kind=kind,  # type: ignore[arg-type]
                        title=str(getattr(d, "title", "")),
                        title_i18n=getattr(d, "title_i18n", None),
                        permission_code=permission_code,
                        meta=meta,
                    )
                )

        items.sort(key=lambda x: (x.kind, x.plugin_id, x.id))
        return items
