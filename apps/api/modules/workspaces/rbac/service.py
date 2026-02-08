from __future__ import annotations

from pathlib import Path

from apps.api.config import Settings
from apps.api.core.i18n import t
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.modules.system.rbac.service import RBACService
from apps.api.plugin.manifest import load_plugin_manifest


class WorkspaceRBACService(RBACService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    def _translate_ref(self, ref: str | None, default: str | None) -> str | None:
        """
        Translate a "namespace:key" reference using current locale resources.

        Notes:
        - Mirrors the plugin module behavior but avoids importing PluginService here.
        """

        if not ref:
            return default
        trimmed = str(ref).strip()
        if not trimmed:
            return default
        if ":" in trimmed:
            namespace, key = trimmed.split(":", 1)
        elif "." in trimmed:
            namespace, key = trimmed.split(".", 1)
        else:
            namespace, key = "plugin", trimmed
        namespace = namespace.strip()
        key = key.strip()
        if not namespace or not key:
            return default
        return t(namespace, key, default=default)

    async def _get_plugin_name_map(self, *, plugin_ids: set[str]) -> dict[str, str]:
        """
        Best-effort plugin display name map for matrix rendering.

        We intentionally do NOT require org-level permissions: RBAC matrix is workspace-scoped.
        """

        if not plugin_ids:
            return {}

        rows = await PluginRecord.filter(plugin_id__in=list(plugin_ids)).all()
        by_id = {str(r.plugin_id): r for r in rows if r.plugin_id}

        out: dict[str, str] = {}
        for pid in plugin_ids:
            record = by_id.get(pid)
            if record is None:
                continue
            name = record.name
            # Try manifest-backed localized name if available.
            try:
                manifest_path = Path(record.storage_path) / "plugin.toml"
                if manifest_path.is_file():
                    manifest = load_plugin_manifest(manifest_path)
                    name = self._translate_ref(manifest.plugin.name_i18n, manifest.plugin.name) or name
            except (OSError, RuntimeError, TypeError, ValueError):
                pass
            if name:
                out[pid] = name
        return out

    async def get_plugin_name_map(self, *, plugin_ids: set[str]) -> dict[str, str]:
        return await self._get_plugin_name_map(plugin_ids=plugin_ids)
