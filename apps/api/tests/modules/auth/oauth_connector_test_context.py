from __future__ import annotations

from pathlib import Path

from src.core.extensions.manager import ExtensionManager
from src.core.registries import ConnectorRegistry


async def build_official_oauth_connector_registry() -> ConnectorRegistry:
    project_root = Path(__file__).resolve().parents[5]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-oauth")
    await manager.register_all(app=None)
    return manager.registry.connectors
