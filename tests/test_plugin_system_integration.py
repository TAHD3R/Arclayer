from __future__ import annotations

import textwrap
import uuid

import pytest

from apps.api.config import get_settings
from apps.api.models.plugin import PluginRecord
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.types import PluginStatus

pytestmark = pytest.mark.integration


def _write_demo_plugin(root, plugin_id: str) -> None:
    _write_demo_plugin_with_deps(root, plugin_id, deps=None)


def _write_demo_plugin_with_deps(root, plugin_id: str, *, deps: list[dict] | None) -> None:
    package_name = f"pkg_{plugin_id.replace('-', '_').replace('.', '_')}"
    slug = plugin_id.replace(".", "-").replace("_", "-").lower()
    plugin_dir = root / package_name
    plugin_dir.mkdir(parents=True, exist_ok=True)

    (plugin_dir / "__init__.py").write_text("", encoding="utf-8")
    (plugin_dir / "plugin.py").write_text(
        textwrap.dedent(
            """
            from apps.api.plugin.types import BasePlugin


            class DemoPlugin(BasePlugin):
                def __init__(self, descriptor, registry):
                    super().__init__(descriptor, registry)
                    self.started = False

                async def on_start(self) -> None:
                    self.started = True

                async def on_stop(self) -> None:
                    self.started = False
            """
        ).lstrip(),
        encoding="utf-8",
    )

    (plugin_dir / "plugin.toml").write_text(
        textwrap
        .dedent(
            """
            {deps_block}
            [plugin]
            id = "{plugin_id}"
            slug = "{slug}"
            name = "Demo Plugin"
            description = "Demo plugin for tests"
            author = "Test"
            version = "0.1.0"
            requires = ">=2026.01.18-dev"
            entrypoint = "{package_name}.plugin:DemoPlugin"

            [[permissions]]
            code = "demo:read"
            name = "Read Demo"
            description = "Allow demo read"
            default_roles = ["admin"]

            [config_schema]

            [[config_schema.sections]]
            id = "general"
            title = "General"

            [[config_schema.sections.fields]]
            key = "enabled"
            type = "bool"
            default = true
            label = "Enabled"
            """
        )
        .format(
            deps_block=_format_deps(deps),
            plugin_id=plugin_id,
            slug=slug,
            package_name=package_name,
        )
        .lstrip(),
        encoding="utf-8",
    )


def _format_deps(deps: list[dict] | None) -> str:
    if not deps:
        return ""
    lines = ["dependencies = ["]
    for item in deps:
        plugin_id = item["id"]
        version = item.get("version")
        optional = bool(item.get("optional", False))
        if version is None:
            lines.append(f'  {{ id = "{plugin_id}", optional = {str(optional).lower()} }},')
        else:
            lines.append(f'  {{ id = "{plugin_id}", version = "{version}", optional = {str(optional).lower()} }},')
    lines.append("]")
    return "\n".join(lines)


async def test_plugin_manager_enable_disable(tmp_path, monkeypatch, db_schema) -> None:
    _ = db_schema
    plugin_id = f"demo_{uuid.uuid4().hex}"
    _write_demo_plugin(tmp_path, plugin_id)

    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(tmp_path))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "0")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    get_settings.cache_clear()

    settings = get_settings()
    manager = PluginManager(settings)
    manager.discover()
    try:
        await manager.sync_records()
        record = await PluginRecord.get(plugin_id=plugin_id)
        assert record.config == {"general": {"enabled": True}}
        assert record.status == PluginStatus.INSTALLED

        await manager.enable(plugin_id)
        assert plugin_id in manager.instances
        assert manager.instances[plugin_id].started is True
        record = await PluginRecord.get(plugin_id=plugin_id)
        assert record.status == PluginStatus.STARTED

        await manager.disable(plugin_id)
        record = await PluginRecord.get(plugin_id=plugin_id)
        assert record.status == PluginStatus.DISABLED
    finally:
        await manager.stop()


async def test_plugin_manager_dependency_enforcement(tmp_path, monkeypatch, db_schema) -> None:
    _ = db_schema
    dep_id = f"demo_dep_{uuid.uuid4().hex}"
    main_id = f"demo_main_{uuid.uuid4().hex}"
    missing_dep_id = f"demo_missing_{uuid.uuid4().hex}"

    _write_demo_plugin_with_deps(tmp_path, dep_id, deps=None)
    _write_demo_plugin_with_deps(
        tmp_path,
        main_id,
        deps=[{"id": dep_id, "version": ">=0.1.0", "optional": False}],
    )
    _write_demo_plugin_with_deps(
        tmp_path,
        f"demo_broken_{uuid.uuid4().hex}",
        deps=[{"id": missing_dep_id, "version": ">=0.1.0", "optional": False}],
    )

    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(tmp_path))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "0")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    get_settings.cache_clear()

    settings = get_settings()
    manager = PluginManager(settings)
    manager.discover()
    try:
        await manager.sync_records()

        # A dependency cannot be disabled while an active dependent exists.
        with pytest.raises(ValueError):
            await manager.disable(dep_id)

        await manager.disable(main_id)
        await manager.disable(dep_id)

        broken_id = next(pid for pid in manager.descriptors if pid.startswith("demo_broken_"))
        with pytest.raises(ValueError):
            await manager.enable(broken_id)
    finally:
        await manager.stop()
