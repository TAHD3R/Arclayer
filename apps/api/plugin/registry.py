from __future__ import annotations

from dataclasses import dataclass, field

from apps.api.plugin.manifest import PermissionTemplate


@dataclass(slots=True)
class PermissionEntry:
    plugin_id: str
    template: PermissionTemplate


@dataclass(slots=True)
class ExtensionRegistry:
    permissions: list[PermissionEntry] = field(default_factory=list)

    def register_permissions(self, plugin_id: str, templates: list[PermissionTemplate]) -> None:
        for template in templates:
            self.permissions.append(PermissionEntry(plugin_id=plugin_id, template=template))

    def unregister_permissions(self, plugin_id: str) -> None:
        self.permissions = [entry for entry in self.permissions if entry.plugin_id != plugin_id]


registry = ExtensionRegistry()
