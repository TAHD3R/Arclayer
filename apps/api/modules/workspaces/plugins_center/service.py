from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import UploadFile

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound
from apps.api.core.i18n import t
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.modules.system.plugins_manager.service import PluginService
from apps.api.modules.workspaces.plugins_center.repository import WorkspacePluginRepository
from apps.api.modules.workspaces.plugins_center.schema import WorkspacePluginSummary
from apps.api.plugin.manifest import ConfigSchema


class WorkspacePluginCenterService(BaseService):
    def __init__(self, settings: Settings, *, plugin_service: PluginService) -> None:
        super().__init__(settings)
        self.repo = WorkspacePluginRepository()
        self.plugin_service = plugin_service

    async def list_workspace_plugins(self, *, workspace_id: UUID) -> list[WorkspacePluginSummary]:
        rows = await PluginRecord.all().order_by("created_at").all()
        state_rows = await self._list_states(workspace_id=workspace_id)
        state_by_id = {str(s.plugin_id): s for s in state_rows if s.plugin_id}

        items: list[WorkspacePluginSummary] = []
        for record in rows:
            summary = self.plugin_service.to_summary(record)
            state = state_by_id.get(str(record.plugin_id))
            items.append(
                WorkspacePluginSummary(
                    plugin_id=str(summary.plugin_id),
                    slug=summary.slug,
                    name=str(summary.name),
                    description=summary.description,
                    version=str(summary.version),
                    author=str(summary.author),
                    status=str(summary.status),
                    enabled=bool(state.enabled) if state is not None else False,
                    config=(state.config if state is not None and isinstance(state.config, dict) else None),
                )
            )
        return items

    async def install_plugin(
        self,
        *,
        workspace_id: UUID,
        file: UploadFile,
        checksum: str | None,
        enable_in_workspace: bool,
    ) -> tuple[WorkspacePluginSummary, bool]:
        # Workspace plugin center expects "global install + workspace toggle".
        # We always install with global enable=True so the plugin can be started after restart.
        record, requires_restart = await self.plugin_service.install_plugin(
            file=file,
            checksum=checksum,
            enable=True,
        )

        if enable_in_workspace:
            await self.repo.set_enabled(workspace_id=workspace_id, plugin_id=record.plugin_id, enabled=True)
        else:
            await self.repo.set_enabled(workspace_id=workspace_id, plugin_id=record.plugin_id, enabled=False)

        # Rebuild summary view.
        summary = self.plugin_service.to_summary(record)
        state = await self.repo.get_state(workspace_id=workspace_id, plugin_id=record.plugin_id)
        out = WorkspacePluginSummary(
            plugin_id=str(summary.plugin_id),
            slug=summary.slug,
            name=str(summary.name),
            description=summary.description,
            version=str(summary.version),
            author=str(summary.author),
            status=str(summary.status),
            enabled=bool(state.enabled) if state is not None else False,
            config=(state.config if state is not None and isinstance(state.config, dict) else None),
        )
        return out, requires_restart

    async def set_enabled(self, *, workspace_id: UUID, plugin_id: str, enabled: bool) -> WorkspacePluginSummary:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None:
            raise NotFound(message=t("plugin", "PLUGIN_NOT_FOUND", default="插件不存在"), error="PLUGIN_NOT_FOUND")

        await self.repo.set_enabled(workspace_id=workspace_id, plugin_id=plugin_id, enabled=enabled)
        state = await self.repo.get_state(workspace_id=workspace_id, plugin_id=plugin_id)
        summary = self.plugin_service.to_summary(record)
        return WorkspacePluginSummary(
            plugin_id=str(summary.plugin_id),
            slug=summary.slug,
            name=str(summary.name),
            description=summary.description,
            version=str(summary.version),
            author=str(summary.author),
            status=str(summary.status),
            enabled=bool(state.enabled) if state is not None else False,
            config=(state.config if state is not None and isinstance(state.config, dict) else None),
        )

    async def uninstall_from_workspace(self, *, workspace_id: UUID, plugin_id: str) -> None:
        # Workspace uninstall is a "detach" operation: keep global installation.
        await self.repo.clear_state(workspace_id=workspace_id, plugin_id=plugin_id)

    async def reset_workspace_config(self, *, workspace_id: UUID, plugin_id: str) -> None:
        await self.repo.set_config(workspace_id=workspace_id, plugin_id=plugin_id, config=None)

    async def update_workspace_config(
        self, *, workspace_id: UUID, plugin_id: str, payload: dict[str, Any]
    ) -> WorkspacePluginSummary:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None:
            raise NotFound(message=t("plugin", "PLUGIN_NOT_FOUND", default="插件不存在"), error="PLUGIN_NOT_FOUND")
        if not record.config_schema:
            raise BadRequest(
                message=t("plugin", "PLUGIN_CONFIG_NOT_SUPPORTED", default="插件不支持配置"),
                error="PLUGIN_CONFIG_NOT_SUPPORTED",
            )

        schema = ConfigSchema.model_validate(record.config_schema)
        updates = payload.get("config")
        if not isinstance(updates, dict):
            raise BadRequest(
                message=t("plugin", "PLUGIN_CONFIG_INVALID", default="插件配置格式不正确"),
                error="PLUGIN_CONFIG_INVALID",
            )

        # Validate payload using the same rules as global plugin config.
        # We store workspace-scoped config as "only overrides"; defaults come from schema.
        self.plugin_service.validate_config_payload(schema, updates)
        await self.repo.set_config(workspace_id=workspace_id, plugin_id=plugin_id, config=updates)

        summary = self.plugin_service.to_summary(record)
        state = await self.repo.get_state(workspace_id=workspace_id, plugin_id=plugin_id)
        return WorkspacePluginSummary(
            plugin_id=str(summary.plugin_id),
            slug=summary.slug,
            name=str(summary.name),
            description=summary.description,
            version=str(summary.version),
            author=str(summary.author),
            status=str(summary.status),
            enabled=bool(state.enabled) if state is not None else False,
            config=(state.config if state is not None and isinstance(state.config, dict) else None),
        )

    async def _list_states(self, *, workspace_id: UUID):
        from apps.api.modules.workspaces.plugins_center.models import WorkspacePluginState

        return await WorkspacePluginState.filter(workspace_id=workspace_id).all()
