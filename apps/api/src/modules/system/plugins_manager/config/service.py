from __future__ import annotations

from apps.api.src.core.exceptions import BadRequest
from apps.api.src.plugin.manifest import ConfigSchema


class PluginConfigMixin:
    def _merge_config(self, current: dict[str, object], updates: dict[str, object]) -> dict[str, object]:
        merged = dict(current or {})
        for section, values in updates.items():
            if section not in merged or not isinstance(merged[section], dict):
                merged[section] = dict(values) if isinstance(values, dict) else values
            else:
                if isinstance(values, dict):
                    for key, value in values.items():
                        merged[section][key] = value
                else:
                    merged[section] = values
        return merged

    def _build_defaults_from_schema(self, schema: ConfigSchema) -> dict[str, object]:
        defaults: dict[str, object] = {}
        for section in schema.sections:
            section_values: dict[str, object] = {}
            for field in section.fields:
                if field.default is not None:
                    section_values[field.key] = field.default
            if section_values:
                defaults[section.id] = section_values
        return defaults

    def _validate_config(self, schema: ConfigSchema, config: dict[str, object]) -> None:
        from apps.api.src.settings.validation import validate_config_schema

        try:
            validate_config_schema(schema, config, allow_unknown=True)
        except BadRequest as exc:
            raise BadRequest(
                message=exc.message,
                error="PLUGIN_CONFIG_INVALID",
                details=getattr(exc, "details", None),
            ) from exc

    def _is_type_valid(self, field_type: str, value: object) -> bool:
        if field_type == "str":
            return isinstance(value, str)
        if field_type == "int":
            return isinstance(value, int) and not isinstance(value, bool)
        if field_type == "float":
            return isinstance(value, (int, float)) and not isinstance(value, bool)
        if field_type == "bool":
            return isinstance(value, bool)
        if field_type == "list":
            return isinstance(value, list)
        if field_type == "dict":
            return isinstance(value, dict)
        return False

    def validate_config_payload(self, schema: ConfigSchema, config: dict[str, object]) -> None:
        self._validate_config(schema, config)

    @staticmethod
    def _flatten_patch_paths(patch: dict[str, object], *, _prefix: str = "") -> list[str]:
        out: list[str] = []
        for key, value in (patch or {}).items():
            if not key:
                continue
            path = f"{_prefix}.{key}" if _prefix else str(key)
            if isinstance(value, dict):
                out.extend(PluginConfigMixin._flatten_patch_paths(value, _prefix=path))
            else:
                out.append(path)
        return out
