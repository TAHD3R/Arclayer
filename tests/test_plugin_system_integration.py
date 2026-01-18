from __future__ import annotations

import os
import textwrap
import uuid

import pytest
from tortoise import Tortoise

from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.models.plugin import PluginRecord
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.types import PluginStatus


def _integration_enabled() -> bool:
    return os.getenv("RUN_INTEGRATION_TESTS") == "1"


def _write_demo_plugin(root, plugin_id: str) -> None:
    plugin_dir = root / "demo"
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
            [plugin]
            id = "{plugin_id}"
            name = "Demo Plugin"
            description = "Demo plugin for tests"
            author = "Test"
            version = "0.1.0"
            requires = ">=2026.01.18-dev"
            entrypoint = "demo.plugin:DemoPlugin"

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
        .format(plugin_id=plugin_id)
        .lstrip(),
        encoding="utf-8",
    )


async def test_plugin_manager_enable_disable(tmp_path, monkeypatch) -> None:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    plugin_id = f"demo_{uuid.uuid4().hex}"
    _write_demo_plugin(tmp_path, plugin_id)

    monkeypatch.setenv("PLUGIN__ENABLED", "1")
    monkeypatch.setenv("PLUGIN__ROOT_DIR", str(tmp_path))
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "0")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    monkeypatch.setenv("DATABASE__ENABLED", "1")

    settings = get_settings()
    manager = PluginManager(settings)
    manager.discover()

    await init_orm(settings)
    await verify_db_ready(settings)
    await Tortoise.generate_schemas(safe=True)
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
        await close_orm()
