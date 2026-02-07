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
from apps.api.modules.workspaces.plugins_center.schema_validate import PluginPackageMeta
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
            category: str | None = None
            manager = getattr(self.plugin_service, "manager", None)
            if manager is not None:
                if not getattr(manager, "descriptors", None):
                    manager.discover()
                desc = manager.descriptors.get(str(summary.plugin_id))
                category = (desc.manifest.plugin.category if desc is not None else None) or None
                requires = (desc.manifest.plugin.requires if desc is not None else None) or None
                license_name = (desc.manifest.plugin.license if desc is not None else None) or None
                has_config_schema = bool(getattr(desc.manifest, "config_schema", None))
            else:
                requires = None
                license_name = None
                has_config_schema = False
            state = state_by_id.get(str(record.plugin_id))
            icon_url = self._build_workspace_plugin_icon_url(
                workspace_id=workspace_id,
                plugin_id=str(record.plugin_id),
                plugin_slug=summary.slug,
            )
            items.append(
                WorkspacePluginSummary(
                    plugin_id=str(summary.plugin_id),
                    slug=summary.slug,
                    name=str(summary.name),
                    description=summary.description,
                    version=str(summary.version),
                    requires=requires,
                    author=str(summary.author),
                    license=license_name,
                    status=str(summary.status),
                    category=category,
                    has_config_schema=has_config_schema,
                    icon_url=icon_url,
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
        category: str | None = None
        manager = getattr(self.plugin_service, "manager", None)
        if manager is not None:
            if not getattr(manager, "descriptors", None):
                manager.discover()
            desc = manager.descriptors.get(str(summary.plugin_id))
            category = (desc.manifest.plugin.category if desc is not None else None) or None
            requires = (desc.manifest.plugin.requires if desc is not None else None) or None
            license_name = (desc.manifest.plugin.license if desc is not None else None) or None
            has_config_schema = bool(getattr(desc.manifest, "config_schema", None))
        else:
            requires = None
            license_name = None
            has_config_schema = False
        state = await self.repo.get_state(workspace_id=workspace_id, plugin_id=record.plugin_id)
        icon_url = self._build_workspace_plugin_icon_url(
            workspace_id=workspace_id,
            plugin_id=str(record.plugin_id),
            plugin_slug=summary.slug,
        )
        out = WorkspacePluginSummary(
            plugin_id=str(summary.plugin_id),
            slug=summary.slug,
            name=str(summary.name),
            description=summary.description,
            version=str(summary.version),
            requires=requires,
            author=str(summary.author),
            license=license_name,
            status=str(summary.status),
            category=category,
            has_config_schema=has_config_schema,
            icon_url=icon_url,
            enabled=bool(state.enabled) if state is not None else False,
            config=(state.config if state is not None and isinstance(state.config, dict) else None),
        )
        return out, requires_restart

    async def validate_plugin_package(
        self,
        *,
        file: UploadFile,
        checksum: str | None,
    ) -> tuple[str, str, int, PluginPackageMeta]:
        token, sha256, size_bytes, manifest = await self.plugin_service.validate_upload_to_staging(
            file=file, checksum=checksum
        )
        meta = PluginPackageMeta(
            plugin_id=manifest.plugin.id,
            slug=manifest.plugin.slug,
            name=manifest.plugin.name,
            description=manifest.plugin.description,
            author=manifest.plugin.author,
            version=manifest.plugin.version,
            requires=manifest.plugin.requires,
            category=manifest.plugin.category,
            icon=manifest.plugin.icon,
            has_config_schema=manifest.config_schema is not None,
            permissions_count=len(getattr(manifest, "permissions", None) or []),
            models_count=len(getattr(manifest, "models", None) or []),
        )
        return token, sha256, size_bytes, meta

    async def install_validated(
        self,
        *,
        workspace_id: UUID,
        token: str,
        enable_in_workspace: bool,
    ) -> tuple[WorkspacePluginSummary, bool]:
        record, requires_restart = await self.plugin_service.install_from_staging_token(token=token, enable=True)

        await self.repo.set_enabled(
            workspace_id=workspace_id,
            plugin_id=record.plugin_id,
            enabled=bool(enable_in_workspace),
        )

        summary = self.plugin_service.to_summary(record)
        category: str | None = None
        manager = getattr(self.plugin_service, "manager", None)
        if manager is not None:
            if not getattr(manager, "descriptors", None):
                manager.discover()
            desc = manager.descriptors.get(str(summary.plugin_id))
            category = (desc.manifest.plugin.category if desc is not None else None) or None
            requires = (desc.manifest.plugin.requires if desc is not None else None) or None
            license_name = (desc.manifest.plugin.license if desc is not None else None) or None
            has_config_schema = bool(getattr(desc.manifest, "config_schema", None))
        else:
            requires = None
            license_name = None
            has_config_schema = False
        state = await self.repo.get_state(workspace_id=workspace_id, plugin_id=record.plugin_id)
        icon_url = self._build_workspace_plugin_icon_url(
            workspace_id=workspace_id,
            plugin_id=str(record.plugin_id),
            plugin_slug=summary.slug,
        )
        out = WorkspacePluginSummary(
            plugin_id=str(summary.plugin_id),
            slug=summary.slug,
            name=str(summary.name),
            description=summary.description,
            version=str(summary.version),
            requires=requires,
            author=str(summary.author),
            license=license_name,
            status=str(summary.status),
            category=category,
            has_config_schema=has_config_schema,
            icon_url=icon_url,
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
        category: str | None = None
        manager = getattr(self.plugin_service, "manager", None)
        if manager is not None:
            if not getattr(manager, "descriptors", None):
                manager.discover()
            desc = manager.descriptors.get(str(summary.plugin_id))
            category = (desc.manifest.plugin.category if desc is not None else None) or None
            requires = (desc.manifest.plugin.requires if desc is not None else None) or None
            license_name = (desc.manifest.plugin.license if desc is not None else None) or None
            has_config_schema = bool(getattr(desc.manifest, "config_schema", None))
        else:
            requires = None
            license_name = None
            has_config_schema = False
        icon_url = self._build_workspace_plugin_icon_url(
            workspace_id=workspace_id,
            plugin_id=str(record.plugin_id),
            plugin_slug=summary.slug,
        )
        return WorkspacePluginSummary(
            plugin_id=str(summary.plugin_id),
            slug=summary.slug,
            name=str(summary.name),
            description=summary.description,
            version=str(summary.version),
            requires=requires,
            author=str(summary.author),
            license=license_name,
            status=str(summary.status),
            category=category,
            has_config_schema=has_config_schema,
            icon_url=icon_url,
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
        category: str | None = None
        manager = getattr(self.plugin_service, "manager", None)
        if manager is not None:
            if not getattr(manager, "descriptors", None):
                manager.discover()
            desc = manager.descriptors.get(str(summary.plugin_id))
            category = (desc.manifest.plugin.category if desc is not None else None) or None
            requires = (desc.manifest.plugin.requires if desc is not None else None) or None
            license_name = (desc.manifest.plugin.license if desc is not None else None) or None
            has_config_schema = bool(getattr(desc.manifest, "config_schema", None))
        else:
            requires = None
            license_name = None
            has_config_schema = False
        state = await self.repo.get_state(workspace_id=workspace_id, plugin_id=plugin_id)
        icon_url = self._build_workspace_plugin_icon_url(
            workspace_id=workspace_id,
            plugin_id=str(record.plugin_id),
            plugin_slug=summary.slug,
        )
        return WorkspacePluginSummary(
            plugin_id=str(summary.plugin_id),
            slug=summary.slug,
            name=str(summary.name),
            description=summary.description,
            version=str(summary.version),
            requires=requires,
            author=str(summary.author),
            license=license_name,
            status=str(summary.status),
            category=category,
            has_config_schema=has_config_schema,
            icon_url=icon_url,
            enabled=bool(state.enabled) if state is not None else False,
            config=(state.config if state is not None and isinstance(state.config, dict) else None),
        )

    async def _list_states(self, *, workspace_id: UUID):
        from apps.api.modules.workspaces.plugins_center.models import WorkspacePluginState

        return await WorkspacePluginState.filter(workspace_id=workspace_id).all()

    def _build_workspace_plugin_icon_url(
        self,
        *,
        workspace_id: UUID,
        plugin_id: str,
        plugin_slug: str | None,
    ) -> str | None:
        """
        Return the icon url/path for a plugin in a workspace context.

        Notes:
        - If manifest declares an absolute URL, return it directly.
        - If manifest declares a relative path, return the workspace icon API path.
        - If no icon is declared, return None.
        """

        manager = getattr(self.plugin_service, "manager", None)
        if manager is not None and not getattr(manager, "descriptors", None):
            manager.discover()
        descriptor = manager.descriptors.get(plugin_id) if manager is not None else None
        if descriptor is None:
            return None
        icon = (descriptor.manifest.plugin.icon or "").strip()
        if not icon:
            return None
        if icon.startswith("http://") or icon.startswith("https://"):
            return icon
        ref = plugin_slug or plugin_id
        # Workspace routes use PublicUUID (nanoid-like) rather than raw UUID.
        from apps.api.common.utils.public_ids import encode_uuid

        return f"/workspaces/{encode_uuid(workspace_id)}/plugins-center/{ref}/icon"
