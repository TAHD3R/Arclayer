"""Integration tests for ExtensionManager — discovery, loading, lifecycle, activation."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest

from src.core.extensions.manager import ExtensionLoadError, ExtensionManager
from src.core.extensions.manifest import (
    CoordinationError,
    PackageState,
    ProcessState,
    WorkspaceActivationState,
)
from src.core.extensions.tenant_registry import TenantAwareRegistrySet

# ——— Fixtures ———————————————————————————————————————————————————————————


@pytest.fixture
def project_root():
    """Create a temporary project root with a plugins/ directory."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "plugins").mkdir()
        yield root


def _write_plugin(
    root: Path,
    name: str,
    manifest: dict | None = None,
    plugin_source: str | None = None,
) -> Path:
    """Write an extension to plugins/<name>/ with extension.json and src/plugin.py."""
    ext_dir = root / "plugins" / name
    ext_dir.mkdir(parents=True)
    (ext_dir / "src").mkdir(exist_ok=True)

    if manifest is None:
        manifest = {"name": name, "version": "1.0.0"}

    (ext_dir / "extension.json").write_text(json.dumps(manifest), encoding="utf-8")

    if plugin_source is None:
        plugin_source = _DEFAULT_PLUGIN_SOURCE

    (ext_dir / "src" / "plugin.py").write_text(plugin_source, encoding="utf-8")
    return ext_dir


_DEFAULT_PLUGIN_SOURCE = """
def create_plugin():
    class Plugin:
        name = "test-plugin"
        def arclayer_register(self, registry):
            pass
        def arclayer_bootstrap(self, app):
            pass
        def arclayer_ready(self, app):
            pass
        def arclayer_destroy(self):
            pass
    return Plugin()
"""

_PLUGIN_WITH_SERVICES = """
from src.core.registries import PluginRegistry

class TestPlugin:
    name = "test-plugin"

    def arclayer_register(self, registry: PluginRegistry) -> None:
        registry.services.register("test-svc", lambda: "test-service-value")

    def arclayer_bootstrap(self, app):
        pass

    def arclayer_ready(self, app):
        pass

    def arclayer_destroy(self):
        pass

def create_plugin():
    return TestPlugin()
"""


# ——— Discovery tests ————————————————————————————————————————————————————


class TestDiscovery:
    def test_no_plugins_dir(self, project_root):
        (project_root / "plugins").rmdir()
        mgr = ExtensionManager(project_root)
        dirs = mgr.discover_extension_dirs()
        assert dirs == []

    def test_empty_plugins_dir(self, project_root):
        mgr = ExtensionManager(project_root)
        dirs = mgr.discover_extension_dirs()
        assert dirs == []

    def test_discovers_extension_with_manifest(self, project_root):
        _write_plugin(project_root, "my-ext")
        mgr = ExtensionManager(project_root)
        dirs = mgr.discover_extension_dirs()
        assert len(dirs) == 1
        assert dirs[0].name == "my-ext"

    def test_ignores_dirs_without_manifest(self, project_root):
        (project_root / "plugins" / "not-an-ext").mkdir()
        (project_root / "plugins" / "not-an-ext" / "some_file.py").write_text("pass")
        mgr = ExtensionManager(project_root)
        dirs = mgr.discover_extension_dirs()
        assert dirs == []

    def test_ignores_hidden_dirs(self, project_root):
        _write_plugin(project_root, ".hidden-ext")
        mgr = ExtensionManager(project_root)
        dirs = mgr.discover_extension_dirs()
        assert dirs == []

    def test_ignores_underscore_dirs(self, project_root):
        _write_plugin(project_root, "_internal")
        mgr = ExtensionManager(project_root)
        dirs = mgr.discover_extension_dirs()
        assert dirs == []

    def test_discovers_multiple_extensions(self, project_root):
        _write_plugin(project_root, "ext-a")
        _write_plugin(project_root, "ext-b")
        mgr = ExtensionManager(project_root)
        dirs = mgr.discover_extension_dirs()
        assert len(dirs) == 2


# ——— Loading tests ——————————————————————————————————————————————————————


class TestLoading:
    async def test_load_single_extension(self, project_root):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root)
        await mgr.load_all()
        assert "test-ext" in mgr.extension_names

    async def test_load_sets_package_and_process_state(self, project_root):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root)
        await mgr.load_all()

        instance = mgr.get_instance("test-ext")
        assert instance is not None
        assert instance.package.state == PackageState.INSTALLED
        assert instance.process.state == ProcessState.LOADED

    async def test_load_twice_raises(self, project_root):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root)
        await mgr.load_all()

        with pytest.raises(ExtensionLoadError, match="already loaded"):
            await mgr.load_extension(project_root / "plugins" / "test-ext")

    async def test_load_broken_manifest_raises(self, project_root):
        from src.core.extensions.manifest import ManifestParseError

        _write_plugin(project_root, "bad-ext", manifest={"name": "bad-ext", "version": "bad"})
        mgr = ExtensionManager(project_root)
        with pytest.raises(ManifestParseError):
            await mgr.load_all()

    async def test_load_missing_entry_raises(self, project_root):
        ext_dir = _write_plugin(
            project_root, "no-entry", manifest={"name": "no-entry", "version": "1.0.0", "entry": "src/nonexistent.py"}
        )
        with pytest.raises(ExtensionLoadError, match="Entry module"):
            await ExtensionManager(project_root).load_extension(ext_dir)

    async def test_load_missing_factory_raises(self, project_root):
        _write_plugin(project_root, "no-factory", plugin_source="x = 1")
        with pytest.raises(ExtensionLoadError, match="create_plugin"):
            await ExtensionManager(project_root).load_extension(project_root / "plugins" / "no-factory")


# ——— Lifecycle tests ————————————————————————————————————————————————————


class TestLifecycle:
    async def test_full_lifecycle(self, project_root):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root)

        # Load
        await mgr.load_all()
        inst = mgr.get_instance("test-ext")
        assert inst is not None
        assert inst.process.state == ProcessState.LOADED

        # Register
        await mgr.register_all(app=None)
        assert inst.process.state == ProcessState.REGISTERED

        # Bootstrap
        await mgr.bootstrap_all(app=None)
        assert inst.process.state == ProcessState.READY

        # Ready
        await mgr.ready_all(app=None)

        # Destroy
        await mgr.destroy_all()
        assert inst.process.state == ProcessState.DESTROYED

    async def test_register_skips_non_loaded(self, project_root):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root)
        # Skip load, try to register
        await mgr.register_all(app=None)
        inst = mgr.get_instance("test-ext")
        assert inst is None  # Not even loaded

    async def test_registry_property(self, project_root):
        mgr = ExtensionManager(project_root)
        assert mgr.registry is not None
        assert mgr.registry.services is not None


# ——— Activation tests ———————————————————————————————————————————————————


class _FakeExtensionWorkspaceRepository:
    """Minimal repository double for activation tests."""

    def __init__(self) -> None:
        self.revisions: dict[object, int] = {}

    async def get_extension_revision(self, workspace_id):
        return self.revisions.setdefault(workspace_id, 1)

    async def set_activation_and_increment_revision(self, extension_name, workspace_id, *, active):
        del extension_name, active
        revision = self.revisions.setdefault(workspace_id, 1) + 1
        self.revisions[workspace_id] = revision
        return revision

    async def list_active_activations(self):
        return []


@pytest.fixture
def fake_workspace_repo():
    return _FakeExtensionWorkspaceRepository()


class TestActivation:
    async def test_activate_after_ready(self, project_root, fake_workspace_repo):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root, workspace_repo=fake_workspace_repo)
        await mgr.load_all()
        await mgr.register_all(app=None)
        await mgr.bootstrap_all(app=None)

        ws_id = uuid4()
        await mgr.activate("test-ext", ws_id)

        inst = mgr.get_instance("test-ext")
        assert inst is not None
        sm = inst.get_workspace_activation(ws_id)
        assert sm.state == WorkspaceActivationState.ACTIVE

    async def test_activate_before_ready_raises(self, project_root, fake_workspace_repo):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root, workspace_repo=fake_workspace_repo)
        await mgr.load_all()

        with pytest.raises(CoordinationError):
            await mgr.activate("test-ext", uuid4())

    async def test_deactivate(self, project_root, fake_workspace_repo):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root, workspace_repo=fake_workspace_repo)
        await mgr.load_all()
        await mgr.register_all(app=None)
        await mgr.bootstrap_all(app=None)

        ws_id = uuid4()
        await mgr.activate("test-ext", ws_id)
        await mgr.deactivate("test-ext", ws_id)

        inst = mgr.get_instance("test-ext")
        assert inst is not None
        sm = inst.get_workspace_activation(ws_id)
        assert sm.state == WorkspaceActivationState.INACTIVE

    async def test_activate_nonexistent_extension_raises(self, project_root):
        mgr = ExtensionManager(project_root)
        with pytest.raises(CoordinationError, match="not loaded"):
            await mgr.activate("nonexistent", uuid4())

    async def test_cross_workspace_isolation(self, project_root, fake_workspace_repo):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root, workspace_repo=fake_workspace_repo)
        await mgr.load_all()
        await mgr.register_all(app=None)
        await mgr.bootstrap_all(app=None)

        ws1 = uuid4()
        ws2 = uuid4()

        await mgr.activate("test-ext", ws1)

        inst = mgr.get_instance("test-ext")
        assert inst is not None
        assert inst.get_workspace_activation(ws1).state == WorkspaceActivationState.ACTIVE
        assert inst.get_workspace_activation(ws2).state == WorkspaceActivationState.INACTIVE

    async def test_activate_is_idempotent(self, project_root, fake_workspace_repo):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root, workspace_repo=fake_workspace_repo)
        await mgr.load_all()
        await mgr.register_all(app=None)
        await mgr.bootstrap_all(app=None)

        ws_id = uuid4()
        first_revision = await mgr.activate("test-ext", ws_id)
        second_revision = await mgr.activate("test-ext", ws_id)

        inst = mgr.get_instance("test-ext")
        assert inst is not None
        assert first_revision == 2
        assert second_revision == 2
        assert inst.get_workspace_activation(ws_id).state == WorkspaceActivationState.ACTIVE


# ——— Tenant-aware registry integration ——————————————————————————————————


class TestTenantRegistryIntegration:
    async def test_activate_registers_in_tenant_registry(self, project_root, fake_workspace_repo):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root, workspace_repo=fake_workspace_repo)
        await mgr.load_all()
        await mgr.register_all(app=None)
        await mgr.bootstrap_all(app=None)

        ws_id = uuid4()
        mgr.tenant_registries.services.register("test-ext", "my-svc", lambda: "value")
        await mgr.activate("test-ext", ws_id)

        result = mgr.tenant_registries.services.resolve("my-svc", ws_id)
        assert result == "value"

    async def test_deactivate_hides_from_tenant_registry(self, project_root, fake_workspace_repo):
        _write_plugin(project_root, "test-ext")
        mgr = ExtensionManager(project_root, workspace_repo=fake_workspace_repo)
        await mgr.load_all()
        await mgr.register_all(app=None)
        await mgr.bootstrap_all(app=None)

        ws_id = uuid4()
        mgr.tenant_registries.services.register("test-ext", "my-svc", lambda: "value")
        await mgr.activate("test-ext", ws_id)
        await mgr.deactivate("test-ext", ws_id)

        result = mgr.tenant_registries.services.resolve("my-svc", ws_id)
        assert result is None

    async def test_tenant_registry_available(self, project_root):
        mgr = ExtensionManager(project_root)
        assert isinstance(mgr.tenant_registries, TenantAwareRegistrySet)
        assert mgr.tenant_registries.services is not None
        assert mgr.tenant_registries.middlewares is not None
        assert mgr.tenant_registries.content_types is not None
        assert mgr.tenant_registries.providers is not None
