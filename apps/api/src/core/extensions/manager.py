from __future__ import annotations

import importlib.util
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from tortoise.transactions import in_transaction

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
from src.core.registries import (
    ComponentRegistry,
    ContentTypeRegistry,
    ControllerRegistry,
    CustomFieldRegistry,
    MiddlewareRegistry,
    PluginRegistry,
    PolicyRegistry,
    ProviderRegistry,
    SanitizerRegistry,
    ServiceRegistry,
    ValidatorRegistry,
)
from src.models.workspaces.workspace import Workspace

logger = get_logger(__name__)

_PLUGINS_DIR_NAME = "plugins"


class ExtensionLoadError(RuntimeError):
    """Raised when an extension cannot be loaded."""


class ExtensionRegistrationError(RuntimeError):
    """Raised when an extension capability cannot be registered."""


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
    """Manages Extension lifecycle.

    Coordinates three state machines (Package / Process / Workspace) per
    extension and maintains tenant-aware registries for runtime resolution.

    Plugins declare capabilities via `arclayer_register(registry)` during
    the REGISTER phase.  The ExtensionManager owns both the legacy
    PluginRegistry and the tenant-aware TenantAwareRegistrySet.
    """

    def __init__(self, project_root: Path | str) -> None:
        self._project_root = Path(project_root)
        self._extensions: dict[str, ExtensionInstance] = {}
        self._tenant_registries = TenantAwareRegistrySet()
        self._registry = PluginRegistry(
            services=ServiceRegistry(),
            controllers=ControllerRegistry(),
            content_types=ContentTypeRegistry(),
            middlewares=MiddlewareRegistry(),
            policies=PolicyRegistry(),
            custom_fields=CustomFieldRegistry(),
            providers=ProviderRegistry(),
            components=ComponentRegistry(),
            validators=ValidatorRegistry(),
            sanitizers=SanitizerRegistry(),
        )

    # ——— Properties ————————————————————————————————————————————————————

    @property
    def tenant_registries(self) -> TenantAwareRegistrySet:
        return self._tenant_registries

    @property
    def registry(self) -> PluginRegistry:
        return self._registry

    @property
    def extension_names(self) -> tuple[str, ...]:
        return tuple(self._extensions.keys())

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
        """Parse manifest, import entry module, and instantiate the plugin."""
        manifest_path = ext_dir / "extension.json"
        manifest = parse_manifest(manifest_path)

        if manifest.name in self._extensions:
            raise ExtensionLoadError(f"Extension '{manifest.name}' is already loaded")

        package_sm = PackageStateMachine(PackageState.ABSENT)
        package_sm.transition_to(PackageState.INSTALLED)

        process_sm = ProcessStateMachine(ProcessState.UNLOADED)
        check_can_load(package_sm.state, process_sm.state)

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
        """Discover and load all extensions from the plugins/ directory.

        Extension load failures are hard failures — the API must not start
        with a broken extension.  Callers that want best-effort loading
        should iterate `discover_extension_dirs()` themselves and handle
        errors per extension.
        """
        for ext_dir in self.discover_extension_dirs():
            await self.load_extension(ext_dir)

    # ——— Lifecycle phases ————————————————————————————————————————————————

    async def register_all(self, app: Any) -> None:
        """Transition LOADED→REGISTERED and call arclayer_register on each plugin."""
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
            if hasattr(plugin, "arclayer_register"):
                plugin.arclayer_register(self._registry)

            self._register_in_tenant_registries(instance)

            logger.info("Extension registered", name=instance.name)

    def _register_in_tenant_registries(self, instance: ExtensionInstance) -> None:
        """Register extension capabilities into tenant-aware registries.

        After arclayer_register(registry) has populated the PluginRegistry,
        read capability instances back from it and register them into the
        tenant-aware registries so they can be resolved per workspace.
        """
        manifest = instance.manifest

        for service_name in manifest.provides.services:
            svc = self._registry.services.resolve(service_name)
            if svc is None:
                raise ExtensionRegistrationError(
                    f"Service '{service_name}' declared in manifest but not registered "
                    f"by extension '{instance.name}' in arclayer_register()"
                )
            self._tenant_registries.services.register(instance.name, service_name, lambda svc=svc: svc)

        for mw_name in manifest.provides.middlewares:
            mw = self._registry.middlewares.resolve(mw_name)
            if mw is None:
                raise ExtensionRegistrationError(
                    f"Middleware '{mw_name}' declared in manifest but not registered "
                    f"by extension '{instance.name}' in arclayer_register()"
                )
            self._tenant_registries.middlewares.register(instance.name, mw_name, lambda mw=mw: mw)

        for prov_name in manifest.provides.providers:
            prov = self._registry.providers.resolve(prov_name)
            if prov is None:
                raise ExtensionRegistrationError(
                    f"Provider '{prov_name}' declared in manifest but not registered "
                    f"by extension '{instance.name}' in arclayer_register()"
                )
            self._tenant_registries.providers.register(instance.name, prov_name, lambda prov=prov: prov)

        for ct_name in manifest.provides.content_types:
            definition = self._registry.content_types.resolve(ct_name)
            if definition is None:
                raise ExtensionRegistrationError(
                    f"Content type '{ct_name}' declared in manifest but not registered "
                    f"by extension '{instance.name}' in arclayer_register()"
                )
            self._tenant_registries.content_types.register(instance.name, ct_name, definition)

    async def bootstrap_all(self, app: Any) -> None:
        """Transition REGISTERED→READY and call arclayer_bootstrap on each plugin."""
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

        self._extensions.clear()

    # ——— Tenant-aware activation ————————————————————————————————————————

    @staticmethod
    async def _persist_activation(
        conn: Any,
        extension_name: str,
        workspace_id: UUID,
        *,
        active: bool,
    ) -> None:
        """Persist activation state.  Silently skipped when the model is unavailable."""
        try:
            from src.models.extensions.workspace_extension_activation import (
                WorkspaceExtensionActivation,
                WorkspaceExtensionActivationStatus,
            )
        except Exception:
            return

        status = WorkspaceExtensionActivationStatus.ACTIVE if active else WorkspaceExtensionActivationStatus.INACTIVE
        defaults: dict[str, Any] = {"status": status}
        if active:
            defaults["activated_at"] = datetime.now(UTC)
            defaults["deactivated_at"] = None
        else:
            defaults["deactivated_at"] = datetime.now(UTC)

        await WorkspaceExtensionActivation.update_or_create(
            extension_name=extension_name,
            workspace_id=workspace_id,
            defaults=defaults,
            using_db=conn,
        )

    async def activate(self, extension_name: str, workspace_id: UUID) -> int:
        instance = self._extensions.get(extension_name)
        if instance is None:
            raise CoordinationError(f"Extension '{extension_name}' is not loaded")

        instance.activate(workspace_id)

        new_revision: int = 1
        try:
            async with in_transaction() as conn:
                workspace = await Workspace.filter(id=workspace_id).using_db(conn).select_for_update().first()
                if workspace is None:
                    raise CoordinationError(f"Workspace {workspace_id} not found")
                workspace.extension_revision += 1
                await workspace.save(update_fields=["extension_revision", "updated_at"], using_db=conn)
                await self._persist_activation(conn, extension_name, workspace_id, active=True)
                new_revision = workspace.extension_revision
        except CoordinationError:
            try:
                instance.deactivate(workspace_id)
            except Exception:
                pass
            raise
        except Exception:
            try:
                instance.deactivate(workspace_id)
            except Exception:
                pass
            raise

        self._tenant_registries.set_active(extension_name, workspace_id)
        logger.info(
            "Extension activated for workspace",
            extension=extension_name,
            workspace_id=str(workspace_id),
            revision=new_revision,
        )
        return new_revision

    async def deactivate(self, extension_name: str, workspace_id: UUID) -> int:
        instance = self._extensions.get(extension_name)
        if instance is None:
            raise CoordinationError(f"Extension '{extension_name}' is not loaded")

        instance.deactivate(workspace_id)

        new_revision: int = 1
        try:
            async with in_transaction() as conn:
                workspace = await Workspace.filter(id=workspace_id).using_db(conn).select_for_update().first()
                if workspace is None:
                    raise CoordinationError(f"Workspace {workspace_id} not found")
                workspace.extension_revision += 1
                await workspace.save(update_fields=["extension_revision", "updated_at"], using_db=conn)
                await self._persist_activation(conn, extension_name, workspace_id, active=False)
                new_revision = workspace.extension_revision
        except CoordinationError:
            try:
                instance.activate(workspace_id)
            except Exception:
                pass
            raise
        except Exception:
            try:
                instance.activate(workspace_id)
            except Exception:
                pass
            raise

        self._tenant_registries.set_inactive(extension_name, workspace_id)
        logger.info(
            "Extension deactivated for workspace",
            extension=extension_name,
            workspace_id=str(workspace_id),
            revision=new_revision,
        )
        return new_revision

    async def restore_persisted_activations(self) -> None:
        """Restore workspace activations from persisted state after restart."""
        try:
            from src.models.extensions.workspace_extension_activation import (
                WorkspaceExtensionActivation,
                WorkspaceExtensionActivationStatus,
            )

            activations = await WorkspaceExtensionActivation.filter(
                status=WorkspaceExtensionActivationStatus.ACTIVE,
            ).all()
        except Exception:
            logger.debug("Cannot restore activation state, DB may not be available", exc_info=True)
            return

        restored = 0
        for record in activations:
            instance = self._extensions.get(record.extension_name)
            if instance is None:
                continue
            try:
                instance.activate(record.workspace_id)
            except CoordinationError:
                continue
            self._tenant_registries.set_active(record.extension_name, record.workspace_id)
            restored += 1
        if restored:
            logger.info("Restored persisted extension activations", count=restored)

    def get_instance(self, name: str) -> ExtensionInstance | None:
        return self._extensions.get(name)
