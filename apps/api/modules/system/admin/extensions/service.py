from __future__ import annotations

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.modules.system.admin.extensions.schema import AdminUIExtensionOut
from apps.api.modules.workspaces.authz_snapshot import get_workspace_authz_snapshot
from apps.api.modules.workspaces.context import get_current_workspace_id
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.types import PluginStatus


class AdminExtensionsService(BaseService):
    def __init__(self, settings: Settings, *, plugin_manager: PluginManager) -> None:
        super().__init__(settings)
        self.plugin_manager = plugin_manager

    async def list_admin_extensions(
        self,
        *,
        user_id,
        slot: str | None,
    ) -> list[AdminUIExtensionOut]:
        workspace_id = get_current_workspace_id()
        if workspace_id is None:
            raise ServiceUnavailable(
                message=t("errors", "WORKSPACE_CONTEXT_REQUIRED", default="需要工作区上下文"),
                error="WORKSPACE_CONTEXT_REQUIRED",
            )

        snap = await get_workspace_authz_snapshot(user_id=user_id, workspace_id=workspace_id)
        permission_set = set(snap.permission_codes or [])
        is_superuser = bool(snap.is_superuser)

        enabled_plugin_ids: set[str] = set()
        try:
            from apps.api.modules.workspaces.plugins_center.models import WorkspacePluginState

            rows = await WorkspacePluginState.filter(workspace_id=workspace_id, enabled=True).values_list(
                "plugin_id", flat=True
            )
            enabled_plugin_ids = {str(x) for x in rows if x}
        except Exception:
            enabled_plugin_ids = set()

        want_slot = (slot or "").strip() or None

        # Ensure descriptors/records are available.
        if not self.plugin_manager.descriptors:
            self.plugin_manager.discover()
        if self.settings.database.enabled and not self.plugin_manager.records:
            # If called early (before plugin lifecycle start), records may not be cached.
            # Fallback to skipping DB status filtering in that case.
            try:
                await self.plugin_manager.sync_records()
            except Exception:
                pass

        items: list[AdminUIExtensionOut] = []
        for plugin_id, desc in self.plugin_manager.descriptors.items():
            # Workspace-scoped toggle gate.
            if plugin_id not in enabled_plugin_ids:
                continue
            record = self.plugin_manager.records.get(plugin_id)
            if record is not None and record.status in {PluginStatus.DISABLED, PluginStatus.FAILED}:
                continue

            decls = list(getattr(desc.manifest, "admin_ui_extensions", None) or [])
            for d in decls:
                ext_slot = str(getattr(d, "slot", "") or "").strip()
                if not ext_slot:
                    continue
                if want_slot is not None and ext_slot != want_slot:
                    continue

                permission_code = getattr(d, "permission_code", None)
                if not is_superuser:
                    if not permission_code:
                        if "admin:access" not in permission_set:
                            continue
                    else:
                        if str(permission_code) not in permission_set:
                            continue

                items.append(
                    AdminUIExtensionOut(
                        plugin_id=plugin_id,
                        id=str(getattr(d, "id", "")),
                        slot=ext_slot,
                        title=str(getattr(d, "title", "")),
                        title_i18n=getattr(d, "title_i18n", None),
                        kind=str(getattr(d, "kind", "")) or "action",
                        icon=getattr(d, "icon", None),
                        permission_code=permission_code,
                        meta=getattr(d, "meta", None) if isinstance(getattr(d, "meta", None), dict) else None,
                    )
                )

        # Stable ordering for deterministic UI.
        items.sort(key=lambda x: (x.slot, x.plugin_id, x.id))
        return items
