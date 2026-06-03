from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any
from uuid import UUID

from src.core.extensions.manifest import (
    CoordinationError,
    ExtensionManifest,
    InvalidStateTransitionError,
    ManifestParseError,
    PackageState,
    PackageStateMachine,
    ProcessState,
    ProcessStateMachine,
    WorkspaceActivationState,
    WorkspaceActivationStateMachine,
    check_can_activate,
    check_can_load,
    parse_manifest,
)
from src.core.extensions.tenant_registry import TenantAwareRegistrySet
from src.core.logging import get_logger
from src.core.plugin.manager import PluginManager
from src.core.plugin.loader import discover_plugins
from src.core.registries import PluginRegistry

logger = get_logger(__name__)

_PLUGINS_DIR_NAME = "plugins"


class ExtensionLoadError(RuntimeError):
    """Raised when an extension cannot be loaded."""


class ExtensionInstance:
    """Runtime representation of a loaded Extension."""

    def __init__(
        self,
        manifest: ExtensionManifest,
        plugin: object,
        package_sm: PackageStateMachine,
        process_sm: ProcessStateMachine,
    ) -> None:
        self.manifest = manifest
        self.plugin = plugin
        self.package = package_sm
        self.process = process_sm
        self._workspace_activations: dict[UUID, WorkspaceActivationStateMachine] = {}

    @property
    def name(self) -> str:
        return self.manifest.name

    def get_workspace_activation(self, workspace_id: UUID) -> WorkspaceActivationStateMachine:
        if workspace_id not in self._workspace_activations:
            self._workspace_activations[workspace_id] = WorkspaceActivationStateMachine()
        return self._workspace_activations[workspace_id]

    def activate(self, workspace_id: UUID) -> None:
        sm = self.get_workspace_activation(workspace_id)
        check_can_activate(self.process.state)
        sm.transition_to(WorkspaceActivationState.ACTIVE)

    def deactivate(self, workspace_id: UUID) -> None:
        sm = self.get_workspace_activation(workspace_id)
        sm.transition_to(WorkspaceActivationState.INACTIVE)


class ExtensionManager:
    """Manages Extension lifecycle, replacing the pluggy PluginManager.

    Coordinates three state machines (Package / Process / Workspace) per
    extension and maintains tenant-aware registries for runtime resolution.

    Backward compatibility: existing pluggy-based plugins are loaded via the
    standard discover_plugins() path and registered through the legacy
    PluginManager.  New-style extensions use extension.json manifests and
    the tenant-aware registries.
    """

    def __init__(self, project_root: Path | str) -> None:
        self._project_root = Path(project_root)
        self._extensions: dict[str, ExtensionInstance] = {}
        self._tenant_registries = TenantAwareRegistrySet()
        self._legacy_pm = PluginManager()
        self._legacy_plugins: list[tuple[str, object]] = []
        self._legacy_registry: PluginRegistry | None = None
        # In-memory workspace revision counters. Incremented on activate/deactivate.
        # The workspace.extension_revision DB field exists for persistence;
        # this counter provides the cache-invalidation value at runtime.
        self._workspace_revisions: dict[UUID, int] = {}

    # ——— Properties ————————————————————————————————————————————————————

    @property
    def tenant_registries(self) -> TenantAwareRegistrySet:
        return self._tenant_registries

    @property
    def extension_names(self) -> tuple[str, ...]:
        return tuple(self._extensions.keys())

    @property
    def legacy_plugin_manager(self) -> PluginManager:
        return self._legacy_pm

    @property
    def legacy_registry(self) -> PluginRegistry | None:
        if self._legacy_registry is None:
            try:
                self._legacy_registry = self._legacy_pm.registry
            except Exception:
                return None
        return self._legacy_registry

    # ——— Discovery ——————————————————————————————————————————————————————

    def discover_extension_dirs(self) -> list[Path]:
        """Scan the plugins/ directory for subdirectories containing extension.json."""
        plugins_root = self._project_root / _PLUGINS_DIR_NAME
        if not plugins_root.is_dir():
            return []
        result: list[Path] = []
        for child in sorted(plugins_root.iterdir()):
            if not child.is_dir() or child.name.startswith("_") or child.name.startswith("."):
                continue
            manifest_path = child / "extension.json"
            if manifest_path.is_file():
                result.append(child)
        return result

    # ——— Loading ————————————————————————————————————————————————————————

    async def load_extension(self, ext_dir: Path) -> ExtensionInstance:
        """Parse manifest, import entry module, and instantiate the plugin.

        Transitions Package ABSENT→INSTALLED and Process UNLOADED→LOADED.
        """
        manifest_path = ext_dir / "extension.json"
        manifest = parse_manifest(manifest_path)

        if manifest.name in self._extensions:
            raise ExtensionLoadError(f"Extension '{manifest.name}' is already loaded")

        package_sm = PackageStateMachine(PackageState.ABSENT)
        package_sm.transition_to(PackageState.INSTALLED)

        process_sm = ProcessStateMachine(ProcessState.UNLOADED)
        check_can_load(package_sm.state, process_sm.state)

        # Import the entry module — resolved relative to ext_dir only.
        entry_path = (ext_dir / manifest.entry).resolve()
        ext_dir_resolved = ext_dir.resolve()
        if not str(entry_path).startswith(str(ext_dir_resolved)):
            raise ExtensionLoadError(
                f"Entry module '{manifest.entry}' resolves outside extension directory {ext_dir}"
            )
        if not entry_path.is_file():
            raise ExtensionLoadError(
                f"Entry module '{manifest.entry}' not found in {ext_dir}"
            )

        spec = importlib.util.spec_from_file_location(
            f"extensions.{manifest.name}",
            str(entry_path),
        )
        if spec is None or spec.loader is None:
            raise ExtensionLoadError(f"Could not load module spec for {entry_path}")

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        factory = getattr(module, "create_plugin", None)
        if factory is None:
            raise ExtensionLoadError(
                f"Extension '{manifest.name}' entry module does not export create_plugin()"
            )

        plugin = factory() if callable(factory) else factory
        process_sm.transition_to(ProcessState.LOADED)

        instance = ExtensionInstance(manifest, plugin, package_sm, process_sm)
        self._extensions[manifest.name] = instance
        logger.info("Extension loaded", name=manifest.name, version=manifest.version)
        return instance

    async def load_all(self) -> None:
        """Discover and load all extensions + legacy plugins."""
        # Load legacy plugins via the standard discovery path.
        try:
            self._legacy_plugins = discover_plugins(root_dir=self._project_root)
            for name, plugin in self._legacy_plugins:
                self._legacy_pm.register(plugin, name=name)
        except Exception as exc:
            logger.error("Failed to discover legacy plugins", error=str(exc))

        # Load new-style extensions from plugins/ directory.
        for ext_dir in self.discover_extension_dirs():
            try:
                await self.load_extension(ext_dir)
            except (ManifestParseError, ExtensionLoadError) as exc:
                logger.error("Failed to load extension", path=str(ext_dir), error=str(exc))
                continue

    # ——— Lifecycle phases ————————————————————————————————————————————————

    async def register_all(self, app: Any) -> None:
        """Transition LOADED→REGISTERED and call arclayer_register on each plugin.

        Legacy plugins register through the pluggy hook system.
        New-style extensions register through both the legacy PluginRegistry
        (for backward compat) and the tenant-aware registries.
        """
        await self._legacy_pm.run_register(app)

        for instance in self._extensions.values():
            try:
                instance.process.transition_to(ProcessState.REGISTERED)
            except InvalidStateTransitionError:
                logger.warning(
                    "Extension not in LOADED state, skipping register",
                    name=instance.name,
                    state=instance.process.state.value,
                )
                continue

            plugin = instance.plugin

            # Legacy registration
            if self.legacy_registry is not None and hasattr(plugin, "arclayer_register"):
                plugin.arclayer_register(self.legacy_registry)

            # Tenant-aware registration
            self._register_in_tenant_registries(instance)

            logger.info("Extension registered", name=instance.name)

    def _register_in_tenant_registries(self, instance: ExtensionInstance) -> None:
        """Register extension capabilities into tenant-aware registries."""
        manifest = instance.manifest

        for service_name in manifest.provides.services:
            factory = self._make_service_factory(instance, service_name)
            self._tenant_registries.services.register(instance.name, service_name, factory)

        for mw_name in manifest.provides.middlewares:
            factory = self._make_middleware_factory(instance, mw_name)
            self._tenant_registries.middlewares.register(instance.name, mw_name, factory)

        for prov_name in manifest.provides.providers:
            factory = self._make_provider_factory(instance, prov_name)
            self._tenant_registries.providers.register(instance.name, prov_name, factory)

        # Sync content types from legacy registry into tenant-aware.
        for ct_name in manifest.provides.content_types:
            definition: dict[str, Any] = {}
            if self.legacy_registry is not None:
                definition = self.legacy_registry.content_types.resolve(ct_name) or {}
            self._tenant_registries.content_types.register(instance.name, ct_name, definition)

    @staticmethod
    def _make_service_factory(instance: ExtensionInstance, name: str) -> Any:
        plugin = instance.plugin
        if hasattr(plugin, name):
            return lambda p=plugin, n=name: getattr(p, n)
        return lambda: f"service:{instance.name}:{name}"

    @staticmethod
    def _make_middleware_factory(instance: ExtensionInstance, name: str) -> Any:
        plugin = instance.plugin
        if hasattr(plugin, name):
            return lambda p=plugin, n=name: getattr(p, n)
        return lambda: f"middleware:{instance.name}:{name}"

    @staticmethod
    def _make_provider_factory(instance: ExtensionInstance, name: str) -> Any:
        plugin = instance.plugin
        if hasattr(plugin, name):
            return lambda p=plugin, n=name: getattr(p, n)
        return lambda: f"provider:{instance.name}:{name}"

    async def bootstrap_all(self, app: Any) -> None:
        """Transition REGISTERED→READY and call arclayer_bootstrap on each plugin."""
        await self._legacy_pm.run_bootstrap(app)

        for instance in self._extensions.values():
            try:
                instance.process.transition_to(ProcessState.READY)
            except InvalidStateTransitionError:
                logger.warning(
                    "Extension not in REGISTERED state, skipping bootstrap",
                    name=instance.name,
                    state=instance.process.state.value,
                )
                continue

            plugin = instance.plugin
            if hasattr(plugin, "arclayer_bootstrap"):
                plugin.arclayer_bootstrap(app)

            logger.info("Extension bootstrapped", name=instance.name)

    async def ready_all(self, app: Any) -> None:
        """Call arclayer_ready on each plugin."""
        await self._legacy_pm.run_ready(app)

        for instance in self._extensions.values():
            plugin = instance.plugin
            if hasattr(plugin, "arclayer_ready"):
                plugin.arclayer_ready(app)

            logger.info("Extension ready", name=instance.name)

    async def destroy_all(self) -> None:
        """Transition all extensions to DESTROYED and call arclayer_destroy."""
        for instance in self._extensions.values():
            plugin = instance.plugin
            if hasattr(plugin, "arclayer_destroy"):
                plugin.arclayer_destroy()

            try:
                instance.process.transition_to(ProcessState.DESTROYED)
            except InvalidStateTransitionError:
                pass

        await self._legacy_pm.run_destroy()
        self._extensions.clear()

    # ——— Tenant-aware activation ————————————————————————————————————————

    def activate(self, extension_name: str, workspace_id: UUID) -> None:
        instance = self._extensions.get(extension_name)
        if instance is None:
            raise CoordinationError(f"Extension '{extension_name}' is not loaded")

        instance.activate(workspace_id)
        self._tenant_registries.set_active(extension_name, workspace_id)
        self._bump_revision(workspace_id)
        logger.info(
            "Extension activated for workspace",
            extension=extension_name,
            workspace_id=str(workspace_id),
            revision=self._workspace_revisions.get(workspace_id, 1),
        )

    def deactivate(self, extension_name: str, workspace_id: UUID) -> None:
        instance = self._extensions.get(extension_name)
        if instance is None:
            raise CoordinationError(f"Extension '{extension_name}' is not loaded")

        instance.deactivate(workspace_id)
        self._tenant_registries.set_inactive(extension_name, workspace_id)
        self._bump_revision(workspace_id)
        logger.info(
            "Extension deactivated for workspace",
            extension=extension_name,
            workspace_id=str(workspace_id),
            revision=self._workspace_revisions.get(workspace_id, 1),
        )

    def get_workspace_revision(self, workspace_id: UUID) -> int:
        return self._workspace_revisions.get(workspace_id, 1)

    def _bump_revision(self, workspace_id: UUID) -> None:
        current = self._workspace_revisions.get(workspace_id, 1)
        self._workspace_revisions[workspace_id] = current + 1

    def get_instance(self, name: str) -> ExtensionInstance | None:
        return self._extensions.get(name)
