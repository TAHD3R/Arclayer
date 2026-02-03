from __future__ import annotations

from pathlib import Path

from apps.api.config import Settings
from apps.api.plugin.manager import PluginManager


def collect_test_plugin_models(settings: Settings) -> list[str]:
    """
    Collect plugin model modules for integration tests.

    Notes:
    - Uses PluginManager discovery to ensure plugin root paths are added to sys.path.
    - Keeps test-only behavior out of core runtime code paths.
    """

    if not settings.plugin.enabled:
        return []
    root_dir = Path(settings.plugin.root_dir)
    if not root_dir.exists():
        return []

    manager = PluginManager(settings)
    manager.discover()
    return manager.collect_model_modules()
