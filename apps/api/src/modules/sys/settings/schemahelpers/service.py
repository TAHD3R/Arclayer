from __future__ import annotations

import json

from apps.api.src.core.exceptions import BadRequest, NotFound
from apps.api.src.core.i18n import t
from apps.api.src.modules.sys.settings.namespaces.schema import (
    SYS_AUTH_SETTINGS_SCHEMA,
    SYS_CORE_SETTINGS_SCHEMA,
    SYS_MAIL_SETTINGS_SCHEMA,
    SYS_NAMESPACE_AUTH,
    SYS_NAMESPACE_CORE_LEGACY,
    SYS_NAMESPACE_MAIL,
    SYS_NAMESPACE_OAUTH,
    SYS_NAMESPACE_STORAGE,
    SYS_OAUTH_SETTINGS_SCHEMA,
    SYS_STORAGE_SETTINGS_SCHEMA,
)
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.schema import ConfigSchema
from apps.api.src.settings.validation import iter_secret_field_paths


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


def _canonical_json_bytes(value: dict[str, object]) -> bytes:
    # Stable encoding for signatures.
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


class SysConfigSchemaHelpersMixin:
    def _get_schema_for_namespace(self, namespace: str) -> ConfigSchema:
        if namespace == SYS_NAMESPACE_STORAGE:
            return SYS_STORAGE_SETTINGS_SCHEMA
        if namespace == SYS_NAMESPACE_MAIL:
            return SYS_MAIL_SETTINGS_SCHEMA
        if namespace == SYS_NAMESPACE_OAUTH:
            return SYS_OAUTH_SETTINGS_SCHEMA
        if namespace == SYS_NAMESPACE_AUTH:
            return SYS_AUTH_SETTINGS_SCHEMA
        if namespace == CORE_SETTINGS_NAMESPACE or namespace == SYS_NAMESPACE_CORE_LEGACY:
            return SYS_CORE_SETTINGS_SCHEMA
        raise NotFound(message=_ts("NAMESPACE_NOT_FOUND", "配置域不存在"), error="SYS_NAMESPACE_NOT_FOUND")

    @staticmethod
    def _schema_section_ids(schema: ConfigSchema) -> set[str]:
        return {str(s.id) for s in (schema.sections or []) if getattr(s, "id", None)}

    @staticmethod
    def _schema_section_field_keys(schema: ConfigSchema) -> dict[str, set[str]]:
        out: dict[str, set[str]] = {}
        for section in (schema.sections or []) or []:
            section_id = str(getattr(section, "id", "") or "").strip()
            if not section_id:
                continue
            keys = {str(getattr(f, "key", "") or "").strip() for f in (getattr(section, "fields", []) or [])}
            out[section_id] = {k for k in keys if k}
        return out

    def _assert_patch_within_schema(self, *, schema: ConfigSchema, patch: dict[str, object]) -> None:
        if not isinstance(patch, dict):
            raise BadRequest(message=_ts("BAD_REQUEST", "参数错误"), error="BAD_REQUEST")

        allowed_sections = self._schema_section_ids(schema)
        allowed_fields = self._schema_section_field_keys(schema)
        for section_id, value in (patch or {}).items():
            if section_id not in allowed_sections:
                raise BadRequest(
                    message=_ts("BAD_REQUEST", "参数错误"),
                    error="SYS_CONFIG_PATCH_OUT_OF_SCHEMA",
                    details={"section_id": section_id},
                )
            if value is not None and not isinstance(value, dict):
                raise BadRequest(message=_ts("BAD_REQUEST", "参数错误"), error="BAD_REQUEST")
            if isinstance(value, dict):
                known_keys = allowed_fields.get(section_id, set())
                for field_key in value.keys():
                    if field_key not in known_keys:
                        raise BadRequest(
                            message=_ts("BAD_REQUEST", "参数错误"),
                            error="SYS_CONFIG_PATCH_FIELD_OUT_OF_SCHEMA",
                            details={"section_id": section_id, "field_key": field_key},
                        )

    def _filter_to_schema_sections(self, *, schema: ConfigSchema, value: dict[str, object]) -> dict[str, object]:
        allowed_sections = self._schema_section_ids(schema)
        return {k: v for k, v in (value or {}).items() if k in allowed_sections}

    def _mask_secrets(
        self, schema: ConfigSchema, config: dict[str, object]
    ) -> tuple[dict[str, object], dict[str, bool]]:
        masked: dict[str, object] = dict(config or {})
        secrets: dict[str, bool] = {}

        for path in iter_secret_field_paths(schema):
            section_id, field_key = path.split(".", 1)
            section = masked.get(section_id)
            if not isinstance(section, dict):
                secrets[path] = False
                continue
            value = section.get(field_key)
            if value is None:
                secrets[path] = False
                continue
            secrets[path] = True
            section[field_key] = None

        return masked, secrets

    def _translate_ref(self, ref: str | None, default: str | None) -> str | None:
        if not ref:
            return default
        trimmed = ref.strip()
        if ":" in trimmed:
            ns, key = trimmed.split(":", 1)
        elif "." in trimmed:
            ns, key = trimmed.split(".", 1)
        else:
            ns, key = "settings", trimmed
        return t(ns.strip(), key.strip(), default=default)

    def _to_schema_item(self, schema: ConfigSchema):
        from apps.api.src.modules.system.settings.schema import (
            SettingsFieldItem,
            SettingsOptionItem,
            SettingsSchemaItem,
            SettingsSectionItem,
        )

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
