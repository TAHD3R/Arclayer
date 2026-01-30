from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Any

from pydantic import Field

from apps.api.common.schemas import BaseSchema
from apps.api.plugin.manifest import PluginManifest
from apps.api.plugin.registry import ExtensionRegistry


class PluginStatus(StrEnum):
    INSTALLED = "installed"
    STARTED = "started"
    STOPPED = "stopped"
    DISABLED = "disabled"
    FAILED = "failed"


class PluginDescriptor(BaseSchema):
    manifest: PluginManifest
    path: Path
    config: dict[str, Any] = Field(default_factory=dict)

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
        """Load hook (sync)."""

    async def on_start(self) -> None:
        """Start hook (may perform I/O)."""

    async def on_stop(self) -> None:
        """Stop hook (may perform I/O)."""
