from __future__ import annotations

from collections.abc import Sequence

from apps.api.src.core.i18n import t
from apps.api.src.modules.system.plugins.manager.schema import (
    PluginConfigFieldItem,
    PluginConfigOptionItem,
    PluginConfigSchemaItem,
    PluginConfigSectionItem,
    PluginPermissionItem,
)
from apps.api.src.plugin.manifest import ConfigSchema, PluginManifest


class PluginLocalizationMixin:
    def _localized_fields(self, manifest: PluginManifest, *, include_schema: bool = True) -> dict[str, object]:
        name = self._translate_ref(manifest.plugin.name_i18n, manifest.plugin.name)
        description = self._translate_ref(manifest.plugin.description_i18n, manifest.plugin.description)
        payload: dict[str, object] = {"name": name, "description": description}
        if include_schema:
            payload["permissions"] = self._localize_permissions(manifest.permissions)
            payload["config_schema"] = self._localize_config_schema(manifest.config_schema)
        return payload

    def _localize_permissions(self, permissions: Sequence[object]) -> list[PluginPermissionItem] | None:
        if not permissions:
            return None
        items: list[PluginPermissionItem] = []
        for perm in permissions:
            items.append(
                PluginPermissionItem(
                    code=getattr(perm, "code", ""),
                    name=self._translate_ref(getattr(perm, "name_i18n", None), getattr(perm, "name", None)),
                    description=self._translate_ref(
                        getattr(perm, "description_i18n", None),
                        getattr(perm, "description", None),
                    ),
                    default_roles=list(getattr(perm, "default_roles", []) or []),
                )
            )
        return items

    def _localize_config_schema(self, schema: ConfigSchema | None) -> PluginConfigSchemaItem | None:
        if schema is None:
            return None
        sections: list[PluginConfigSectionItem] = []
        for section in schema.sections:
            fields: list[PluginConfigFieldItem] = []
            for field in section.fields:
                options: list[PluginConfigOptionItem] = []
                for opt in getattr(field, "options", []) or []:
                    options.append(
                        PluginConfigOptionItem(
                            value=getattr(opt, "value", None),
                            label=self._translate_ref(getattr(opt, "label_i18n", None), getattr(opt, "label", None)),
                            description=self._translate_ref(
                                getattr(opt, "description_i18n", None),
                                getattr(opt, "description", None),
                            ),
                        )
                    )
                fields.append(
                    PluginConfigFieldItem(
                        key=field.key,
                        type=field.type,
                        default=field.default,
                        secret=bool(getattr(field, "secret", False)),
                        options=options,
                        ui=getattr(field, "ui", None),
                        label=self._translate_ref(field.label_i18n, field.label),
                        description=self._translate_ref(field.description_i18n, field.description),
                    )
                )
            sections.append(
                PluginConfigSectionItem(
                    id=section.id,
                    title=self._translate_ref(section.title_i18n, section.title),
                    fields=fields,
                )
            )
        return PluginConfigSchemaItem(sections=sections)

    def _translate_ref(self, ref: str | None, default: str | None) -> str | None:
        if not ref:
            return default
        namespace, key = self._split_i18n_ref(ref)
        if not namespace or not key:
            return default
        return t(namespace, key, default=default)

    @staticmethod
    def _split_i18n_ref(ref: str) -> tuple[str, str]:
        trimmed = ref.strip()
        if ":" in trimmed:
            namespace, key = trimmed.split(":", 1)
        elif "." in trimmed:
            namespace, key = trimmed.split(".", 1)
        else:
            return "plugin", trimmed
        return namespace.strip(), key.strip()
