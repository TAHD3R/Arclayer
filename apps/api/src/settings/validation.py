from __future__ import annotations

from typing import cast

from src.core.exceptions import BadRequest
from src.core.i18n import t
from src.settings.schema import ConfigSchema


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


def merge_deep(current: dict[str, object], patch: dict[str, object]) -> dict[str, object]:
    """
    Deep-merge dictionaries for settings updates.

    Notes:
    - `None` overwrites the current value (does not delete the key).
    - Unknown keys are preserved.
    """

    merged: dict[str, object] = dict(current or {})
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_deep(
                cast(dict[str, object], merged[key]),
                cast(dict[str, object], value),
            )
        else:
            merged[key] = value
    return merged


def validate_config_schema(
    schema: ConfigSchema,
    config: dict[str, object],
    *,
    allow_unknown: bool = True,
) -> None:
    """
    Validate config values against a ConfigSchema.

    - Validates types for known fields.
    - Allows unknown sections/fields when allow_unknown=True (preserved as-is).
    """

    sections = {section.id: section for section in schema.sections}
    for section_id, values in (config or {}).items():
        section = sections.get(section_id)
        if section is None:
            if allow_unknown:
                continue
            raise BadRequest(
                message=_ts("CONFIG_ITEM_INVALID", "配置项不合法"),
                error="SETTINGS_CONFIG_INVALID",
            )

        if not isinstance(values, dict):
            # Known section must be a dict for field-level validation.
            raise BadRequest(
                message=_ts("CONFIG_ITEM_INVALID", "配置项不合法"),
                error="SETTINGS_CONFIG_INVALID",
            )

        values_dict = cast(dict[str, object], values)
        fields = {field.key: field for field in section.fields}
        for key, value in values_dict.items():
            field = fields.get(key)
            if field is None:
                if allow_unknown:
                    continue
                raise BadRequest(
                    message=_ts("CONFIG_ITEM_INVALID", "配置项不合法"),
                    error="SETTINGS_CONFIG_INVALID",
                )
            if value is None:
                continue
            if not _is_type_valid(field.type, value):
                raise BadRequest(
                    message=_ts("CONFIG_TYPE_INVALID", "配置项类型不正确"),
                    error="SETTINGS_CONFIG_INVALID",
                )

        _validate_section_semantics(section_id, values_dict)


def _is_type_valid(field_type: str, value: object) -> bool:
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


def _validate_section_semantics(section_id: str, values: dict[str, object]) -> None:
    if section_id != "mail":
        return

    starttls = values.get("starttls")
    ssl_tls = values.get("ssl_tls")
    if starttls is True and ssl_tls is True:
        raise BadRequest(
            message=_ts("MAIL_TRANSPORT_CONFLICT", "STARTTLS 与 SSL/TLS 不能同时开启"),
            error="MAIL_TRANSPORT_CONFLICT",
        )


def iter_secret_field_paths(schema: ConfigSchema) -> list[str]:
    paths: list[str] = []
    for section in schema.sections:
        for field in section.fields:
            if getattr(field, "secret", False):
                paths.append(f"{section.id}.{field.key}")
    return paths
