from __future__ import annotations

from uuid import UUID

from apps.api.common.repositories import BaseRepository
from apps.api.modules.workspaces.plugins_center.models import WorkspacePluginState


class WorkspacePluginRepository(BaseRepository):
    async def get_state(self, *, workspace_id: UUID, plugin_id: str) -> WorkspacePluginState | None:
        return await WorkspacePluginState.get_or_none(workspace_id=workspace_id, plugin_id=plugin_id)

    async def ensure_state(self, *, workspace_id: UUID, plugin_id: str) -> WorkspacePluginState:
        state, _created = await WorkspacePluginState.get_or_create(
            workspace_id=workspace_id,
            plugin_id=plugin_id,
            defaults={"enabled": False, "config": None},
        )
        return state

    async def set_enabled(self, *, workspace_id: UUID, plugin_id: str, enabled: bool) -> WorkspacePluginState:
        state = await self.ensure_state(workspace_id=workspace_id, plugin_id=plugin_id)
        state.enabled = bool(enabled)
        await state.save(update_fields=["enabled", "updated_at"])
        return state

    async def clear_state(self, *, workspace_id: UUID, plugin_id: str) -> None:
        await WorkspacePluginState.filter(workspace_id=workspace_id, plugin_id=plugin_id).delete()

    async def set_config(self, *, workspace_id: UUID, plugin_id: str, config: dict | None) -> WorkspacePluginState:
        state = await self.ensure_state(workspace_id=workspace_id, plugin_id=plugin_id)
        state.config = config
        await state.save(update_fields=["config", "updated_at"])
        return state

    async def list_enabled_plugin_ids(self, *, workspace_id: UUID) -> set[str]:
        rows = await WorkspacePluginState.filter(workspace_id=workspace_id, enabled=True).values_list(
            "plugin_id", flat=True
        )
        return {str(x) for x in rows if x}
