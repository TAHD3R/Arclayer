from __future__ import annotations

import asyncio
import importlib
import os
import re
import signal
import sys
import time
import uuid
from asyncio.subprocess import PIPE
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from packaging.specifiers import SpecifierSet
from packaging.version import InvalidVersion, Version
from pydantic import ValidationError

from apps.api.config import Settings
from apps.api.core.database.valkey import ValkeyClient
from apps.api.core.i18n import register_locale_path
from apps.api.core.logging import get_logger
from apps.api.models.plugin import PluginRecord
from apps.api.plugin.manifest import build_default_config, load_plugin_manifest
from apps.api.plugin.registry import ExtensionRegistry, registry
from apps.api.plugin.restart import request_restart
from apps.api.plugin.types import BasePlugin, PluginDescriptor, PluginStatus

logger = get_logger(__name__)

MIGRATION_LOCK_KEY = "plugin:migrate:lock"
PROTECTED_PLUGINS = frozenset({"com.celestial.rbac.core"})


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
        # Lazily created in async context to avoid binding to a closed loop in sync code paths.
        self._migration_lock: asyncio.Lock | None = None

    def bind_valkey(self, client: ValkeyClient | None) -> None:
        self.valkey = client

    def _ensure_sys_path(self) -> None:
        root = str(self.root_dir)
        if root not in sys.path:
            sys.path.insert(0, root)
        if not self.root_dir.exists():
            return
        for path in self.root_dir.iterdir():
            if not path.is_dir():
                continue
            if path.name.startswith("."):
                continue
            path_str = str(path)
            if path_str not in sys.path:
                sys.path.insert(0, path_str)
            src_path = path / "src"
            if src_path.is_dir():
                src_str = str(src_path)
                if src_str not in sys.path:
                    sys.path.insert(0, src_str)

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

            register_locale_path(manifest_path.parent / "locales")
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
        for descriptor in self.descriptors.values():
            self.registry.register_permissions(descriptor.plugin_id, descriptor.manifest.permissions)

        for plugin_id in self._resolve_start_order():
            descriptor = self.descriptors[plugin_id]
            record = self.records.get(plugin_id)
            if record and record.status == PluginStatus.DISABLED:
                logger.info("Plugin disabled, skip start", plugin_id=plugin_id)
                continue
            issues = self._validate_dependencies_for_start(descriptor)
            if issues:
                if record:
                    record.status = PluginStatus.FAILED
                    await record.save()
                logger.error(
                    "Plugin dependency check failed",
                    plugin_id=plugin_id,
                    issues=issues,
                )
                continue

            if (
                self.settings.database.enabled
                and self._requires_restart(descriptor)
                and self.settings.plugin.auto_migrate
            ):
                try:
                    await self._run_migrations(plugin_id)
                except Exception as exc:
                    if record:
                        record.status = PluginStatus.FAILED
                        await record.save()
                    logger.exception("Plugin migration failed", plugin_id=plugin_id, error=str(exc))
                    continue

            await self._start_plugin(descriptor, record)

    async def stop(self) -> None:
        for plugin_id, instance in list(self.instances.items()):
            await self._stop_plugin(plugin_id, instance)

    async def enable(self, plugin_id: str) -> PluginRecord:
        descriptor = await self._ensure_descriptor(plugin_id)
        record = await self._ensure_record(descriptor)

        await self._ensure_dependencies_enabled(descriptor)

        if record.status == PluginStatus.DISABLED:
            record.status = PluginStatus.INSTALLED
            record.started_at = None
            await record.save()

        if plugin_id in self.instances:
            return record

        # If any required dependency needs a restart to be activated in-process, avoid
        # starting this plugin now and request a restart instead.
        if self._needs_restart_due_to_dependencies(descriptor):
            await self._request_restart(plugin_id, reason="enable")
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

        if plugin_id in PROTECTED_PLUGINS:
            raise ValueError(f"Plugin is protected and cannot be disabled: {plugin_id}")
        dependents = self._list_active_dependents(plugin_id)
        if dependents:
            raise ValueError(f"Plugin is required by other plugins: {dependents}")

        instance = self.instances.get(plugin_id)
        if instance is not None:
            await self._stop_plugin(plugin_id, instance)

        record.status = PluginStatus.DISABLED
        record.started_at = None
        await record.save()

        if self._requires_restart(descriptor):
            await self._request_restart(plugin_id, reason="disable")
        return record

    async def request_restart(self, plugin_id: str | None, *, reason: str) -> None:
        await self._request_restart(plugin_id, reason=reason)

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

    def _resolve_start_order(self) -> list[str]:
        """
        Return plugin ids in a best-effort topological order based on declared dependencies.

        The order is used to increase the chance that dependency-providing plugins start
        before dependent plugins.
        """

        nodes = set(self.descriptors.keys())
        outgoing: dict[str, set[str]] = {pid: set() for pid in nodes}
        indegree: dict[str, int] = dict.fromkeys(nodes, 0)

        for pid, desc in self.descriptors.items():
            for dep in getattr(desc.manifest, "dependencies", []) or []:
                if dep.id not in nodes:
                    # Missing deps will be handled by validation and reported as failures.
                    continue
                if dep.id == pid:
                    continue
                if pid in outgoing[dep.id]:
                    continue
                outgoing[dep.id].add(pid)
                indegree[pid] += 1

        queue = sorted([pid for pid, deg in indegree.items() if deg == 0])
        order: list[str] = []
        while queue:
            pid = queue.pop(0)
            order.append(pid)
            for nxt in sorted(outgoing.get(pid, set())):
                indegree[nxt] -= 1
                if indegree[nxt] == 0:
                    queue.append(nxt)
                    queue.sort()

        if len(order) != len(nodes):
            # Cycle or unresolved edges; fall back to stable ordering for remaining nodes.
            remaining = sorted(nodes.difference(order))
            logger.error("Plugin dependency cycle detected", plugins=remaining)
            order.extend(remaining)
        return order

    def _validate_dependencies_for_start(self, descriptor: PluginDescriptor) -> list[str]:
        issues: list[str] = []
        for dep in getattr(descriptor.manifest, "dependencies", []) or []:
            if dep.optional:
                continue
            dep_desc = self.descriptors.get(dep.id)
            dep_record = self.records.get(dep.id)
            if dep_desc is None:
                issues.append(f"missing dependency: {dep.id}")
                continue
            if dep_record is not None:
                if dep_record.status == PluginStatus.DISABLED:
                    issues.append(f"dependency disabled: {dep.id}")
                    continue
                if dep_record.status == PluginStatus.FAILED:
                    issues.append(f"dependency failed: {dep.id}")
                    continue

            if dep.version:
                installed = dep_desc.manifest.plugin.version
                if not _satisfies_version(installed, dep.version):
                    issues.append(f"dependency version mismatch: {dep.id} ({installed} not in {dep.version})")
        return issues

    async def _ensure_dependencies_enabled(self, descriptor: PluginDescriptor) -> None:
        """
        Ensure required dependencies are installed and enabled before enabling the plugin.
        """

        visited: set[str] = set()
        visiting: set[str] = set()

        async def _walk(current: PluginDescriptor) -> None:
            if current.plugin_id in visited:
                return
            if current.plugin_id in visiting:
                raise ValueError(f"Cyclic dependency detected at: {current.plugin_id}")
            visiting.add(current.plugin_id)
            visited.add(current.plugin_id)

            try:
                for dep in getattr(current.manifest, "dependencies", []) or []:
                    if dep.optional:
                        continue
                    dep_desc = self.descriptors.get(dep.id)
                    if dep_desc is None:
                        raise ValueError(f"Missing dependency: {dep.id}")
                    if dep.version and not _satisfies_version(dep_desc.manifest.plugin.version, dep.version):
                        raise ValueError(
                            f"Dependency version mismatch: {dep.id} "
                            f"({dep_desc.manifest.plugin.version} not in {dep.version})"
                        )
                    dep_record = self.records.get(dep.id)
                    if dep_record is None:
                        # Should not happen if sync_records has run, but keep it defensive.
                        raise ValueError(f"Dependency record not found: {dep.id}")
                    if dep_record.status == PluginStatus.DISABLED:
                        await self.enable(dep.id)
                    if dep_record.status == PluginStatus.FAILED:
                        raise ValueError(f"Dependency failed: {dep.id}")
                    await _walk(dep_desc)
            finally:
                visiting.discard(current.plugin_id)

        await _walk(descriptor)

    def _needs_restart_due_to_dependencies(self, descriptor: PluginDescriptor) -> bool:
        for dep in getattr(descriptor.manifest, "dependencies", []) or []:
            if dep.optional:
                continue
            dep_desc = self.descriptors.get(dep.id)
            if dep_desc is None:
                continue
            if self._requires_restart(dep_desc) and dep.id not in self.instances:
                return True
        return False

    def _list_active_dependents(self, plugin_id: str) -> list[str]:
        """
        Return dependent plugins that are currently active (not disabled).
        """

        results: list[str] = []
        for pid, desc in self.descriptors.items():
            if pid == plugin_id:
                continue
            for dep in getattr(desc.manifest, "dependencies", []) or []:
                if dep.optional:
                    continue
                if dep.id != plugin_id:
                    continue
                record = self.records.get(pid)
                if record is None:
                    continue
                if record.status != PluginStatus.DISABLED:
                    results.append(pid)
        return sorted(set(results))

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
        if self._migration_lock is None:
            self._migration_lock = asyncio.Lock()
        async with self._migration_lock:
            token = await self._acquire_migration_lock()
            if token is None and self.valkey is not None:
                raise RuntimeError("Plugin migration lock busy")
            try:
                # Aerich migration names become part of Python module filenames; keep them import-safe.
                safe_name = _sanitize_migration_name(f"plugin_{plugin_id}")
                await self._run_aerich("migrate", "--name", safe_name, "--no-input")
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


def _sanitize_migration_name(value: str) -> str:
    # Keep only characters safe for Python module filenames.
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "_", value).strip("_")
    return cleaned or "plugin_migration"


def _satisfies_version(installed: str, spec: str) -> bool:
    try:
        return Version(installed) in SpecifierSet(spec)
    except InvalidVersion:
        return False
    except Exception:
        return False


def _load_plugin_class(entrypoint: str) -> type[BasePlugin]:
    if ":" not in entrypoint:
        raise ValueError(f"Invalid entrypoint: {entrypoint}")
    module_name, class_name = entrypoint.split(":", 1)
    module = importlib.import_module(module_name)
    plugin_class = getattr(module, class_name)
    if not issubclass(plugin_class, BasePlugin):
        raise TypeError("Plugin entrypoint must extend BasePlugin")
    return plugin_class
