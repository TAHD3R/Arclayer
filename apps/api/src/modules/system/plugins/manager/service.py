from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, NotFound
from apps.api.src.core.http.pagination import PageData, PageParams
from apps.api.src.core.i18n import t
from apps.api.src.core.logging import get_logger
from apps.api.src.models.system.plugin import PluginRecord
from apps.api.src.modules.system.admin.menus.seeds.service import AdminMenuSeedService
from apps.api.src.modules.system.plugins.manager.config.service import PluginConfigMixin
from apps.api.src.modules.system.plugins.manager.install.service import PluginInstallService, UploadLike
from apps.api.src.modules.system.plugins.manager.presenters.service import PluginPresentersMixin
from apps.api.src.modules.system.plugins.manager.repository import PluginRepository
from apps.api.src.modules.system.plugins.manager.schema import PluginSummary
from apps.api.src.plugin.event_bus import Event
from apps.api.src.plugin.events import SETTINGS_UPDATED
from apps.api.src.plugin.manager import PluginManager
from apps.api.src.plugin.manifest import ConfigSchema

logger = get_logger(__name__)

_FATAL_PLUGIN_SERVICE_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_PLUGIN_SERVICE_ERRORS):
        raise exc


def _tp(key: str, default: str) -> str:
    return t("plugin", key, default=default)


class PluginService(
    PluginConfigMixin,
    PluginPresentersMixin,
    BaseService,
):
    def __init__(self, settings: Settings, *, manager: PluginManager | None = None) -> None:
        super().__init__(settings)
        self.repo = PluginRepository()
        self.manager = manager
        self.root_dir = Path(settings.plugin.root_dir)
        self._install = PluginInstallService(
            settings,
            repo=self.repo,
            manager=manager,
            root_dir=self.root_dir,
            merge_config=self._merge_config,
        )

    async def list_plugins(self) -> list[PluginRecord]:
        return await self.repo.list_plugins()

    async def list_plugins_paginated(self, *, params: PageParams) -> PageData[PluginSummary]:
        from math import ceil

        qs = self.repo.query_plugins()
        total = int(await qs.count())
        pages = ceil(total / params.size) if params.size else 0

        if total == 0 or params.page > pages:
            items: list[PluginSummary] = []
        else:
            rows = await qs.limit(params.limit).offset(params.offset)
            items = [self.to_summary(row) for row in rows]

        next_page: int | None = None
        prev_page: int | None = None
        if pages > 0:
            if params.page < pages:
                next_page = params.page + 1
            if params.page > 1:
                prev_page = min(params.page - 1, pages)

        return PageData[PluginSummary](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def get_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.repo.get_plugin(plugin_id)
        if record is None:
            raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件不存在"), error="PLUGIN_NOT_FOUND")
        return record

    def resolve_plugin_id(self, plugin_ref: str) -> str:
        manager = self._require_manager()
        if not manager.descriptors:
            manager.discover()

        if plugin_ref in manager.descriptors:
            return plugin_ref

        resolved = manager.slug_to_id.get(plugin_ref)
        if resolved:
            return resolved

        raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件不存在"), error="PLUGIN_NOT_FOUND")

    async def install_plugin(
        self,
        *,
        file: UploadLike,
        checksum: str | None,
        enable: bool,
    ) -> tuple[PluginRecord, bool]:
        return await self._install.install_plugin(file=file, checksum=checksum, enable=enable)

    async def validate_upload_to_staging(
        self,
        *,
        file: UploadFile,
        checksum: str | None,
        ttl_seconds: int = 10 * 60,
    ):
        return await self._install.validate_upload_to_staging(file=file, checksum=checksum, ttl_seconds=ttl_seconds)

    async def install_from_staging_token(
        self,
        *,
        token: str,
        enable: bool,
    ) -> tuple[PluginRecord, bool]:
        return await self._install.install_from_staging_token(token=token, enable=enable)

    async def enable_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.get_plugin(plugin_id)
        manager = self._require_manager()
        try:
            await manager.enable(plugin_id)
        except ValueError as exc:
            raise BadRequest(
                message=_tp("PLUGIN_DEPENDENCY_ERROR", "插件依赖错误"),
                error="PLUGIN_DEPENDENCY_ERROR",
                details=str(exc),
            ) from exc
        except KeyError as exc:
            raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件未安装"), error="PLUGIN_NOT_FOUND") from exc
        await record.refresh_from_db()
        try:
            manifest = self._load_manifest(record)
            seeds = list(getattr(manifest, "admin_menu", None) or []) if manifest is not None else []
            if seeds:
                await AdminMenuSeedService(self.settings).ensure_seeds(
                    owner_plugin_id=plugin_id,
                    seeds=seeds,
                    update_existing=False,
                    restore_deleted=True,
                )
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Plugin admin menu seed failed on enable",
                plugin_id=plugin_id,
                action="enable_plugin_seed_admin_menu",
                error=str(exc),
            )
        return record

    async def disable_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.get_plugin(plugin_id)
        manager = self._require_manager()
        try:
            await manager.disable(plugin_id)
        except ValueError as exc:
            raise BadRequest(
                message=_tp("PLUGIN_DEPENDENCY_ERROR", "插件依赖错误"),
                error="PLUGIN_DEPENDENCY_ERROR",
                details=str(exc),
            ) from exc
        except KeyError as exc:
            raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件未安装"), error="PLUGIN_NOT_FOUND") from exc
        await record.refresh_from_db()
        return record

    async def uninstall_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.disable_plugin(plugin_id)
        return record

    async def update_config(self, plugin_id: str, payload: dict[str, Any]) -> tuple[PluginRecord, bool]:
        record = await self.get_plugin(plugin_id)
        if not record.config_schema:
            raise BadRequest(
                message=_tp("PLUGIN_CONFIG_NOT_SUPPORTED", "插件不支持配置"),
                error="PLUGIN_CONFIG_NOT_SUPPORTED",
            )

        schema = ConfigSchema.model_validate(record.config_schema)
        defaults = self._build_defaults_from_schema(schema)
        current = record.config if isinstance(record.config, dict) else {}
        merged = self._merge_config(defaults, current)
        updates = payload.get("config")
        if not isinstance(updates, dict):
            raise BadRequest(
                message=_tp("PLUGIN_CONFIG_INVALID", "插件配置格式不正确"),
                error="PLUGIN_CONFIG_INVALID",
            )
        merged = self._merge_config(merged, updates)
        self._validate_config(schema, merged)
        await self.repo.update_config(record, merged)
        await record.refresh_from_db()
        requires_restart = True
        await self._request_restart(plugin_id, reason="config")
        try:
            if self.manager is not None:
                desc = self.manager.descriptors.get(plugin_id)
                await self.manager.host.event_bus.publish(
                    Event(
                        name=SETTINGS_UPDATED,
                        payload={
                            "namespace": f"plugin:{plugin_id}",
                            "plugin_id": plugin_id,
                            "plugin_slug": desc.manifest.plugin.slug if desc is not None else None,
                            "paths": list(self._flatten_patch_paths(updates)),
                        },
                        source="core",
                    )
                )
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Plugin settings update event publish failed",
                plugin_id=plugin_id,
                action="publish_plugin_settings_updated_event",
                event_name=SETTINGS_UPDATED,
                error=str(exc),
            )
        return record, requires_restart

    async def _request_restart(self, plugin_id: str, *, reason: str) -> None:
        if self.manager is None:
            return
        await self.manager.request_restart(plugin_id, reason=reason)
