from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from apps.api.plugin.manifest import PermissionTemplate


class ExtensionPointType(StrEnum):
    SINGLETON = "singleton"
    MULTI_INSTANCE = "multi-instance"


@dataclass(slots=True)
class ExtensionPoint:
    name: str
    kind: ExtensionPointType
    description: str | None = None


@dataclass(slots=True)
class PermissionEntry:
    plugin_id: str
    template: PermissionTemplate


@dataclass(slots=True)
class ExtensionEntry:
    plugin_id: str
    extension_point: str
    instance: Any


@dataclass(slots=True)
class ExtensionRegistry:
    permissions: list[PermissionEntry] = field(default_factory=list)
    extension_points: dict[str, ExtensionPoint] = field(default_factory=dict)
    extensions: dict[str, list[ExtensionEntry]] = field(default_factory=dict)

    def register_permissions(self, plugin_id: str, templates: list[PermissionTemplate]) -> None:
        existing = {(entry.plugin_id, entry.template.code) for entry in self.permissions}
        for template in templates:
            key = (plugin_id, template.code)
            if key in existing:
                continue
            self.permissions.append(PermissionEntry(plugin_id=plugin_id, template=template))
            existing.add(key)

    def unregister_permissions(self, plugin_id: str) -> None:
        self.permissions = [entry for entry in self.permissions if entry.plugin_id != plugin_id]

    def register_extension_point(
        self,
        name: str,
        kind: ExtensionPointType,
        *,
        description: str | None = None,
    ) -> None:
        existing = self.extension_points.get(name)
        if existing is not None:
            if existing.kind != kind:
                raise ValueError("Extension point already registered with a different type")
            return
        self.extension_points[name] = ExtensionPoint(name=name, kind=kind, description=description)

    def register_extension(self, plugin_id: str, extension_point: str, instance: Any) -> None:
        point = self.extension_points.get(extension_point)
        if point is None:
            raise ValueError(f"Extension point not registered: {extension_point}")
        entries = self.extensions.setdefault(extension_point, [])
        if point.kind == ExtensionPointType.SINGLETON:
            if entries:
                if entries[0].plugin_id != plugin_id:
                    raise ValueError("Singleton extension point already registered by another plugin")
                entries[0] = ExtensionEntry(
                    plugin_id=plugin_id,
                    extension_point=extension_point,
                    instance=instance,
                )
                return
            entries.append(
                ExtensionEntry(
                    plugin_id=plugin_id,
                    extension_point=extension_point,
                    instance=instance,
                )
            )
            return
        entries.append(
            ExtensionEntry(
                plugin_id=plugin_id,
                extension_point=extension_point,
                instance=instance,
            )
        )

    def unregister_extensions(self, plugin_id: str, extension_point: str | None = None) -> None:
        if extension_point is not None:
            entries = self.extensions.get(extension_point, [])
            self.extensions[extension_point] = [entry for entry in entries if entry.plugin_id != plugin_id]
            return
        for key, entries in list(self.extensions.items()):
            self.extensions[key] = [entry for entry in entries if entry.plugin_id != plugin_id]

    def get_extension(self, extension_point: str) -> Any | None:
        point = self.extension_points.get(extension_point)
        if point is None:
            return None
        entries = self.extensions.get(extension_point, [])
        if point.kind == ExtensionPointType.SINGLETON:
            return entries[0].instance if entries else None
        return [entry.instance for entry in entries]


registry = ExtensionRegistry()
