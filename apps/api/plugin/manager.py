from __future__ import annotations

import asyncio
import importlib
import os
import signal
import sys
import time
import uuid
from asyncio.subprocess import PIPE
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from apps.api.config import Settings
from apps.api.core.database.valkey import ValkeyClient
from apps.api.core.logging import get_logger
from apps.api.models.plugin import PluginRecord
from apps.api.plugin.manifest import build_default_config, load_plugin_manifest
from apps.api.plugin.registry import ExtensionRegistry, registry
from apps.api.plugin.restart import request_restart
from apps.api.plugin.types import BasePlugin, PluginDescriptor, PluginStatus

logger = get_logger(__name__)

MIGRATION_LOCK_KEY = "plugin:migrate:lock"


class PluginManager:
    def __init__(self, settings: Settings, *, extension_registry: ExtensionRegistry | None = None) -> None:
        self.settings = settings
        self.root_dir = Path(settings.plugin.root_dir)
        self.project_root = Path(__file__).resolve().parents[3]
        self.registry = extension_registry or registry
        self.descriptors: dict[str, PluginDescriptor] = {}
        self.instances: dict[str, BasePlugin] = {}
        self.records: dict[str, PluginRecord] = {}
        self.valkey: ValkeyClient | None = None
        self._migration_lock = asyncio.Lock()

    def bind_valkey(self, client: ValkeyClient | None) -> None:
        self.valkey = client

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

            await self._start_plugin(descriptor, record)

    async def stop(self) -> None:
        for plugin_id, instance in list(self.instances.items()):
            await self._stop_plugin(plugin_id, instance)

    async def enable(self, plugin_id: str) -> PluginRecord:
        descriptor = await self._ensure_descriptor(plugin_id)
        record = await self._ensure_record(descriptor)

        if record.status == PluginStatus.DISABLED:
            record.status = PluginStatus.INSTALLED
            record.started_at = None
            await record.save()

        if plugin_id in self.instances:
            return record

        if self._requires_restart(descriptor):
            if self.settings.plugin.auto_migrate:
                try:
                    await self._run_migrations(plugin_id)
                except Exception as exc:
                    record.status = PluginStatus.FAILED
                    await record.save()
                    logger.exception("Plugin migration failed", plugin_id=plugin_id, error=str(exc))
                    raise
            await self._request_restart(plugin_id, reason="enable")
            return record

        await self._start_plugin(descriptor, record)
        return record

    async def disable(self, plugin_id: str) -> PluginRecord:
        descriptor = await self._ensure_descriptor(plugin_id)
        record = await self._ensure_record(descriptor)

        instance = self.instances.get(plugin_id)
        if instance is not None:
            await self._stop_plugin(plugin_id, instance)

        record.status = PluginStatus.DISABLED
        record.started_at = None
        await record.save()

        if self._requires_restart(descriptor):
            await self._request_restart(plugin_id, reason="disable")
        return record

    async def _ensure_descriptor(self, plugin_id: str) -> PluginDescriptor:
        if plugin_id not in self.descriptors:
            self.discover()
            await self.sync_records()
        descriptor = self.descriptors.get(plugin_id)
        if descriptor is None:
            raise KeyError(f"Plugin not found: {plugin_id}")
        return descriptor

    async def _ensure_record(self, descriptor: PluginDescriptor) -> PluginRecord:
        record = self.records.get(descriptor.plugin_id)
        if record is None:
            record = await PluginRecord.get(plugin_id=descriptor.plugin_id)
            self.records[descriptor.plugin_id] = record
        return record

    def _requires_restart(self, descriptor: PluginDescriptor) -> bool:
        return bool(descriptor.manifest.models)

    async def _start_plugin(self, descriptor: PluginDescriptor, record: PluginRecord | None) -> None:
        try:
            plugin_class = _load_plugin_class(descriptor.entrypoint)
            instance = plugin_class(descriptor, self.registry)
            instance.on_load()
            self.registry.register_permissions(descriptor.plugin_id, descriptor.manifest.permissions)
            await instance.on_start()
            self.instances[descriptor.plugin_id] = instance

            if record:
                record.status = PluginStatus.STARTED
                record.started_at = datetime.now(UTC)
                await record.save()

            logger.info("Plugin started", plugin_id=descriptor.plugin_id)
        except Exception as exc:
            logger.exception("Plugin start failed", plugin_id=descriptor.plugin_id, error=str(exc))
            self.registry.unregister_permissions(descriptor.plugin_id)
            self.instances.pop(descriptor.plugin_id, None)
            if record:
                record.status = PluginStatus.FAILED
                await record.save()

    async def _stop_plugin(self, plugin_id: str, instance: BasePlugin) -> None:
        try:
            await instance.on_stop()
            self.registry.unregister_permissions(plugin_id)
            record = self.records.get(plugin_id)
            if record:
                record.status = PluginStatus.STOPPED
                await record.save()
            self.instances.pop(plugin_id, None)
            logger.info("Plugin stopped", plugin_id=plugin_id)
        except Exception as exc:
            logger.exception("Plugin stop failed", plugin_id=plugin_id, error=str(exc))

    async def _run_migrations(self, plugin_id: str) -> None:
        async with self._migration_lock:
            token = await self._acquire_migration_lock()
            if token is None and self.valkey is not None:
                raise RuntimeError("Plugin migration lock busy")
            try:
                await self._run_aerich("migrate", "--name", f"plugin_{plugin_id}", "--no-input")
                await self._run_aerich("upgrade")
            finally:
                if token and self.valkey is not None:
                    await self._release_migration_lock(token)

    async def _acquire_migration_lock(self) -> str | None:
        if self.valkey is None:
            logger.warning("Plugin migration lock skipped (valkey not ready)")
            return None
        token = uuid.uuid4().hex
        ttl = self.settings.plugin.migration_lock_ttl_seconds
        timeout = self.settings.plugin.migration_lock_timeout_seconds
        deadline = time.monotonic() + max(timeout, 0)
        while time.monotonic() < deadline:
            ok = await self.valkey.set(MIGRATION_LOCK_KEY, token, ex=ttl, nx=True)
            if ok:
                return token
            await asyncio.sleep(0.5)
        return None

    async def _release_migration_lock(self, token: str) -> None:
        if self.valkey is None:
            return
        script = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        end
        return 0
        """
        key = self.valkey.key(MIGRATION_LOCK_KEY)
        try:
            await self.valkey.raw.eval(script, 1, key, token)
        except Exception as exc:
            logger.warning("Plugin migration lock release failed", error=str(exc))

    async def _run_aerich(self, *args: str) -> None:
        pyproject = self.project_root / "pyproject.toml"
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "aerich",
            "--config",
            str(pyproject),
            *args,
            cwd=str(self.project_root),
            stdout=PIPE,
            stderr=PIPE,
        )
        stdout, stderr = await proc.communicate()
        out = stdout.decode("utf-8", errors="ignore").strip()
        err = stderr.decode("utf-8", errors="ignore").strip()
        if proc.returncode != 0:
            logger.error("Aerich command failed", args=list(args), stdout=out, stderr=err)
            raise RuntimeError("Aerich command failed")
        if out:
            logger.info("Aerich command output", args=list(args), stdout=out)
        if err:
            logger.warning("Aerich command stderr", args=list(args), stderr=err)

    async def _request_restart(self, plugin_id: str, *, reason: str) -> None:
        if not self.settings.plugin.auto_restart:
            logger.info("Plugin restart skipped (disabled)", plugin_id=plugin_id)
            return
        if self.valkey is None:
            logger.warning("Plugin restart fallback to self-exit", plugin_id=plugin_id)
            asyncio.create_task(self._delayed_exit())
            return
        epoch = await request_restart(self.valkey, plugin_id=plugin_id, reason=reason)
        logger.warning("Plugin restart scheduled", plugin_id=plugin_id, epoch=epoch)

    async def _delayed_exit(self) -> None:
        delay = max(self.settings.plugin.restart_jitter_seconds, 0)
        if delay:
            await asyncio.sleep(delay)
        os.kill(os.getpid(), signal.SIGTERM)


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
