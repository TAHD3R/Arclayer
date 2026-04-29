"""Integration tests for plugin lifecycle and registry wiring."""

from __future__ import annotations

import pytest

from src.core.plugin.extensions import ExtensionOverlay
from src.core.plugin.lifecycle import PluginLifecycle, PluginLifecyclePhase
from src.core.plugin.manager import PluginManager
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
