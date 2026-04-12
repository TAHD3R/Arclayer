from __future__ import annotations

from apps.api.src.core.i18n import t
from apps.api.src.modules.system.settings.schema import (
    SettingsFieldItem,
    SettingsOptionItem,
    SettingsSchemaItem,
    SettingsSectionItem,
)
from apps.api.src.settings.schema import ConfigSchema


class SettingsSchemaHelpersMixin:
    def _to_schema_item(self, schema: ConfigSchema) -> SettingsSchemaItem:
        sections: list[SettingsSectionItem] = []
        for section in schema.sections:
            fields: list[SettingsFieldItem] = []
            for field in section.fields:
                options: list[SettingsOptionItem] = []
                for opt in getattr(field, "options", []) or []:
                    options.append(
                        SettingsOptionItem(
                            value=getattr(opt, "value", None),
                            label=self._translate_ref(getattr(opt, "label_i18n", None), getattr(opt, "label", None)),
                            description=self._translate_ref(
                                getattr(opt, "description_i18n", None),
                                getattr(opt, "description", None),
                            ),
                        )
                    )
                fields.append(
                    SettingsFieldItem(
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
                SettingsSectionItem(
                    id=section.id,
                    title=self._translate_ref(section.title_i18n, section.title),
                    fields=fields,
                )
            )
        return SettingsSchemaItem(sections=sections)

    def _translate_ref(self, ref: str | None, default: str | None) -> str | None:
        if not ref:
            return default
        trimmed = ref.strip()
        if ":" in trimmed:
            namespace, key = trimmed.split(":", 1)
        elif "." in trimmed:
            namespace, key = trimmed.split(".", 1)
        else:
            namespace, key = "settings", trimmed
        namespace = namespace.strip()
        key = key.strip()
        return t(namespace, key, default=default)
