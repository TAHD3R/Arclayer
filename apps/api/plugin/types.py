from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

from apps.api.plugin.manifest import PluginManifest
from apps.api.plugin.registry import ExtensionRegistry


class PluginStatus(StrEnum):
    INSTALLED = "installed"
    STARTED = "started"
    STOPPED = "stopped"
    DISABLED = "disabled"
    FAILED = "failed"


@dataclass(slots=True)
class PluginDescriptor:
    manifest: PluginManifest
    path: Path
    config: dict[str, Any]

    @property
    def plugin_id(self) -> str:
        return self.manifest.plugin.id

    @property
    def entrypoint(self) -> str:
        return self.manifest.plugin.entrypoint


class BasePlugin:
    def __init__(self, descriptor: PluginDescriptor, registry: ExtensionRegistry) -> None:
        self.descriptor = descriptor
        self.registry = registry

    @property
    def plugin_id(self) -> str:
        return self.descriptor.plugin_id

    def on_load(self) -> None:
        """加载阶段钩子（同步）。"""

    async def on_start(self) -> None:
        """启动阶段钩子（可做 IO）。"""

    async def on_stop(self) -> None:
        """停止阶段钩子（可做 IO）。"""
