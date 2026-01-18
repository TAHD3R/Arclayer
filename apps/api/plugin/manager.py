from __future__ import annotations

import importlib
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from apps.api.config import Settings
from apps.api.core.logging import get_logger
from apps.api.models.plugin import PluginRecord
from apps.api.plugin.manifest import build_default_config, load_plugin_manifest
from apps.api.plugin.registry import ExtensionRegistry, registry
from apps.api.plugin.types import BasePlugin, PluginDescriptor, PluginStatus

logger = get_logger(__name__)


class PluginManager:
    def __init__(self, settings: Settings, *, extension_registry: ExtensionRegistry | None = None) -> None:
        self.settings = settings
        self.root_dir = Path(settings.plugin.root_dir)
        self.registry = extension_registry or registry
        self.descriptors: dict[str, PluginDescriptor] = {}
        self.instances: dict[str, BasePlugin] = {}
        self.records: dict[str, PluginRecord] = {}

    def _ensure_sys_path(self) -> None:
        root = str(self.root_dir)
        if root not in sys.path:
            sys.path.insert(0, root)

    def discover(self) -> list[PluginDescriptor]:
        if not self.settings.plugin.enabled:
            logger.info("Plugin discovery skipped (disabled)")
            return []

        if not self.root_dir.exists():
            logger.info("Plugin directory not found", path=str(self.root_dir))
            return []

        self._ensure_sys_path()
        descriptors: dict[str, PluginDescriptor] = {}
        for manifest_path in self.root_dir.glob("*/plugin.toml"):
            try:
                manifest = load_plugin_manifest(manifest_path)
            except (OSError, ValidationError) as exc:
                logger.warning("Plugin manifest invalid", path=str(manifest_path), error=str(exc))
                continue

            defaults = build_default_config(manifest)
            descriptor = PluginDescriptor(manifest=manifest, path=manifest_path.parent, config=defaults)
            descriptors[descriptor.plugin_id] = descriptor

        self.descriptors = descriptors
        return list(descriptors.values())

    def collect_model_modules(self) -> list[str]:
        modules: list[str] = []
        for descriptor in self.descriptors.values():
            modules.extend(descriptor.manifest.models)
        return sorted(set(modules))

    async def sync_records(self) -> None:
        for descriptor in self.descriptors.values():
            manifest = descriptor.manifest
            defaults = descriptor.config
            record, created = await PluginRecord.get_or_create(
                plugin_id=descriptor.plugin_id,
                defaults={
                    "name": manifest.plugin.name,
                    "description": manifest.plugin.description,
                    "author": manifest.plugin.author,
                    "version": manifest.plugin.version,
                    "requires": manifest.plugin.requires,
                    "entrypoint": manifest.plugin.entrypoint,
                    "website": manifest.plugin.website,
                    "repository": manifest.plugin.repository,
                    "issues": manifest.plugin.issues,
                    "license": manifest.plugin.license,
                    "status": PluginStatus.INSTALLED,
                    "storage_path": str(descriptor.path),
                    "permissions": [p.model_dump() for p in manifest.permissions],
                    "config_schema": manifest.config_schema.model_dump() if manifest.config_schema else None,
                    "config": defaults or None,
                },
            )

            if not created:
                record.name = manifest.plugin.name
                record.description = manifest.plugin.description
                record.author = manifest.plugin.author
                record.version = manifest.plugin.version
                record.requires = manifest.plugin.requires
                record.entrypoint = manifest.plugin.entrypoint
                record.website = manifest.plugin.website
                record.repository = manifest.plugin.repository
                record.issues = manifest.plugin.issues
                record.license = manifest.plugin.license
                record.storage_path = str(descriptor.path)
                record.permissions = [p.model_dump() for p in manifest.permissions]
                record.config_schema = manifest.config_schema.model_dump() if manifest.config_schema else None
                if record.config is None:
                    record.config = defaults or None
                else:
                    record.config = _merge_config(record.config, defaults)
                if record.status is None:
                    record.status = PluginStatus.INSTALLED
                await record.save()

            self.records[descriptor.plugin_id] = record
            descriptor.config = record.config or defaults

    async def start(self) -> None:
        for plugin_id, descriptor in self.descriptors.items():
            record = self.records.get(plugin_id)
            if record and record.status == PluginStatus.DISABLED:
                logger.info("Plugin disabled, skip start", plugin_id=plugin_id)
                continue

            try:
                plugin_class = _load_plugin_class(descriptor.entrypoint)
                instance = plugin_class(descriptor, self.registry)
                instance.on_load()
                self.registry.register_permissions(plugin_id, descriptor.manifest.permissions)
                await instance.on_start()
                self.instances[plugin_id] = instance

                if record:
                    record.status = PluginStatus.STARTED
                    record.started_at = datetime.now(UTC)
                    await record.save()

                logger.info("Plugin started", plugin_id=plugin_id)
            except Exception as exc:
                logger.exception("Plugin start failed", plugin_id=plugin_id, error=str(exc))
                if record:
                    record.status = PluginStatus.FAILED
                    await record.save()

    async def stop(self) -> None:
        for plugin_id, instance in list(self.instances.items()):
            try:
                await instance.on_stop()
                self.registry.unregister_permissions(plugin_id)
                record = self.records.get(plugin_id)
                if record:
                    record.status = PluginStatus.STOPPED
                    await record.save()
                logger.info("Plugin stopped", plugin_id=plugin_id)
            except Exception as exc:
                logger.exception("Plugin stop failed", plugin_id=plugin_id, error=str(exc))


def _merge_config(current: dict[str, Any], defaults: dict[str, Any]) -> dict[str, Any]:
    merged = dict(current or {})
    for section, values in defaults.items():
        if section not in merged or not isinstance(merged[section], dict):
            merged[section] = dict(values)
        else:
            for key, value in values.items():
                merged[section].setdefault(key, value)
    return merged


def _load_plugin_class(entrypoint: str) -> type[BasePlugin]:
    if ":" not in entrypoint:
        raise ValueError(f"Invalid entrypoint: {entrypoint}")
    module_name, class_name = entrypoint.split(":", 1)
    module = importlib.import_module(module_name)
    plugin_class = getattr(module, class_name)
    if not issubclass(plugin_class, BasePlugin):
        raise TypeError("Plugin entrypoint must extend BasePlugin")
    return plugin_class
