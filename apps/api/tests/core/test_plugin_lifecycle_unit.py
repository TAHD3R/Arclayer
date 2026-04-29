"""Integration tests for plugin lifecycle and registry wiring."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI

from src.core.plugin.extensions import ExtensionOverlay
from src.core.plugin.lifecycle import PluginLifecycle, PluginLifecyclePhase
from src.core.plugin.loader import PluginLoadError
from src.core.plugin.manager import PluginManager
from src.core.plugin.runtime import close_plugin_runtime, init_plugin_runtime
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


def _write_plugin(root: Path, name: str, source: str) -> None:
    plugin_dir = root / "plugins" / name
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "__init__.py").write_text(source, encoding="utf-8")


class TestPluginLifecycle:
    async def test_lifecycle_phases_are_sequential(self):
        """Lifecycle enum values represent the correct phases."""
        phases = list(PluginLifecyclePhase)
        assert PluginLifecyclePhase.DISCOVER in phases
        assert PluginLifecyclePhase.LOAD in phases
        assert PluginLifecyclePhase.REGISTER in phases
        assert PluginLifecyclePhase.BOOTSTRAP in phases
        assert PluginLifecyclePhase.READY in phases
        assert PluginLifecyclePhase.DESTROY in phases

    async def test_lifecycle_starts_at_discover(self):
        lifecycle = PluginLifecycle()
        assert lifecycle.current_phase == PluginLifecyclePhase.DISCOVER

    async def test_lifecycle_transitions_track_phase(self):
        pm = PluginManager()
        lifecycle = PluginLifecycle()

        await lifecycle.transition(PluginLifecyclePhase.LOAD, plugin_manager=pm)
        assert lifecycle.current_phase == PluginLifecyclePhase.LOAD

        await lifecycle.transition(PluginLifecyclePhase.REGISTER, plugin_manager=pm)
        assert lifecycle.current_phase == PluginLifecyclePhase.REGISTER


class TestPluginManager:
    async def test_plugin_manager_creates_composite_registry(self):
        pm = PluginManager()
        await pm.run_register(app=None)
        assert pm.registry is not None
        assert isinstance(pm.registry, PluginRegistry)

    async def test_composite_registry_has_all_sub_registries(self):
        pm = PluginManager()
        await pm.run_register(app=None)
        reg = pm.registry
        assert isinstance(reg.services, ServiceRegistry)
        assert isinstance(reg.controllers, ControllerRegistry)
        assert isinstance(reg.content_types, ContentTypeRegistry)
        assert isinstance(reg.middlewares, MiddlewareRegistry)
        assert isinstance(reg.policies, PolicyRegistry)
        assert isinstance(reg.custom_fields, CustomFieldRegistry)
        assert isinstance(reg.providers, ProviderRegistry)
        assert isinstance(reg.components, ComponentRegistry)
        assert isinstance(reg.validators, ValidatorRegistry)
        assert isinstance(reg.sanitizers, SanitizerRegistry)

    async def test_registry_register_and_resolve(self):
        reg = ServiceRegistry()
        reg.register("test", object())
        assert reg.resolve("test") is not None

    async def test_registry_resolve_missing_returns_none(self):
        reg = ServiceRegistry()
        assert reg.resolve("nonexistent") is None

    async def test_plugin_names_tracked(self):
        pm = PluginManager()

        class FakePlugin:
            pass

        pm.register(FakePlugin(), name="test-plugin")
        assert "test-plugin" in pm.plugin_names


class TestPluginRuntimeStartup:
    async def test_startup_registers_internal_plugin_and_registry(self, tmp_path):
        app = FastAPI()

        runtime = await init_plugin_runtime(app, project_root=tmp_path)

        assert runtime is app.state.plugin_runtime
        assert "arclayer-core" in app.state.plugin_manager.plugin_names
        assert isinstance(app.state.plugin_registry, PluginRegistry)
        assert app.state.plugin_registry is app.state.plugin_runtime.registry

        await close_plugin_runtime(app)

    async def test_startup_discovers_local_project_plugins(self, tmp_path):
        _write_plugin(
            tmp_path,
            "local_probe",
            """
from src.core.plugin import arclayer_hookimpl


class LocalProbePlugin:
    @arclayer_hookimpl
    def arclayer_register(self, registry):
        registry.services.register("local-probe", {"source": "local"})


def create_plugin():
    return LocalProbePlugin()
""",
        )
        app = FastAPI()

        await init_plugin_runtime(app, project_root=tmp_path)

        assert "local_probe" in app.state.plugin_manager.plugin_names
        assert app.state.plugin_registry.services.resolve("local-probe") == {"source": "local"}

        await close_plugin_runtime(app)

    async def test_startup_runs_lifecycle_order_and_destroy(self, tmp_path, monkeypatch):
        log_path = tmp_path / "plugin-events.log"
        monkeypatch.setenv("PLUGIN_EVENT_LOG", str(log_path))
        _write_plugin(
            tmp_path,
            "ordered_probe",
            """
import os
from pathlib import Path

from src.core.plugin import arclayer_hookimpl


def _record(phase):
    with Path(os.environ["PLUGIN_EVENT_LOG"]).open("a", encoding="utf-8") as handle:
        handle.write(phase + "\\n")


class OrderedProbePlugin:
    @arclayer_hookimpl
    def arclayer_register(self, registry):
        _record("register")

    @arclayer_hookimpl
    def arclayer_bootstrap(self, app):
        _record("bootstrap")

    @arclayer_hookimpl
    def arclayer_ready(self, app):
        _record("ready")

    @arclayer_hookimpl
    def arclayer_destroy(self):
        _record("destroy")


def create_plugin():
    return OrderedProbePlugin()
""",
        )
        app = FastAPI()

        await init_plugin_runtime(app, project_root=tmp_path)
        await close_plugin_runtime(app)

        assert log_path.read_text(encoding="utf-8").splitlines() == [
            "register",
            "bootstrap",
            "ready",
            "destroy",
        ]

    async def test_startup_plugin_load_failure_propagates(self, tmp_path):
        _write_plugin(
            tmp_path,
            "broken_probe",
            """
def create_plugin():
    raise RuntimeError("broken plugin startup")
""",
        )
        app = FastAPI()

        with pytest.raises(PluginLoadError, match="broken_probe"):
            await init_plugin_runtime(app, project_root=tmp_path)


class TestExtensionOverlay:
    def test_schema_override_parse_errors_surface(self, tmp_path):
        schema_file = tmp_path / "example" / "content-types" / "article" / "schema.json"
        schema_file.parent.mkdir(parents=True)
        schema_file.write_text("{invalid", encoding="utf-8")

        overlay = ExtensionOverlay(tmp_path)

        with pytest.raises(ValueError):
            overlay.get_schema_overrides("example")

    def test_server_extension_import_errors_surface(self, tmp_path):
        server_file = tmp_path / "example" / "strapi-server.py"
        server_file.parent.mkdir(parents=True)
        server_file.write_text("raise RuntimeError('boom')\n", encoding="utf-8")

        overlay = ExtensionOverlay(tmp_path)

        with pytest.raises(RuntimeError, match="boom"):
            overlay.get_server_extension("example")
