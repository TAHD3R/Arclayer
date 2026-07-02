from __future__ import annotations

import re
from typing import cast

from src.common.types.json_types import JsonObject
from src.core.exceptions import BadRequest
from src.core.i18n import t
from src.settings.schema import ConfigSchema


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


def merge_deep(current: JsonObject, patch: JsonObject) -> JsonObject:
    """
    Deep-merge dictionaries for settings updates.

    Notes:
    - `None` overwrites the current value (does not delete the key).
    - Unknown keys are preserved.
    """

    merged: JsonObject = dict(current or {})
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_deep(
                cast(JsonObject, merged[key]),
                cast(JsonObject, value),
            )
        else:
            merged[key] = value
    return merged


def validate_config_schema(
    schema: ConfigSchema,
    config: JsonObject,
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

        values_dict = cast(JsonObject, values)
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


def _validate_section_semantics(section_id: str, values: JsonObject) -> None:
    if section_id == "ai_agents":
        _validate_ai_agents_settings(values)
        return
    if section_id == "langgraph":
        _validate_langgraph_settings(values)
        return
    if section_id == "domains":
        _validate_domains_settings(values)
        return
    if section_id != "mail":
        return

    provider = values.get("provider")
    provider_ids = {"smtp", "resend", "cloudflare", "ses"}
    if provider is not None and provider not in provider_ids:
        raise BadRequest(
            message=_ts("MAIL_PROVIDER_INVALID", "邮件 Provider 不合法"),
            error="MAIL_PROVIDER_INVALID",
        )

    fallback_chain = values.get("fallback_chain")
    if fallback_chain is not None:
        if not isinstance(fallback_chain, list) or any(item not in provider_ids for item in fallback_chain):
            raise BadRequest(
                message=_ts("MAIL_FALLBACK_CHAIN_INVALID", "邮件备用 Provider 配置不合法"),
                error="MAIL_FALLBACK_CHAIN_INVALID",
            )

    retry = values.get("retry")
    if retry is not None:
        if not isinstance(retry, dict):
            raise BadRequest(
                message=_ts("MAIL_RETRY_INVALID", "邮件重试配置不合法"),
                error="MAIL_RETRY_INVALID",
            )
        retry_config = cast(JsonObject, retry)
        max_attempts = retry_config.get("max_attempts")
        backoff_seconds = retry_config.get("backoff_seconds")
        if max_attempts is not None and (
            not isinstance(max_attempts, int) or isinstance(max_attempts, bool) or max_attempts < 1 or max_attempts > 10
        ):
            raise BadRequest(
                message=_ts("MAIL_RETRY_INVALID", "邮件重试配置不合法"),
                error="MAIL_RETRY_INVALID",
            )
        if backoff_seconds is not None and (
            not isinstance(backoff_seconds, list)
            or any(not isinstance(item, int) or isinstance(item, bool) or item < 0 for item in backoff_seconds)
        ):
            raise BadRequest(
                message=_ts("MAIL_RETRY_INVALID", "邮件重试配置不合法"),
                error="MAIL_RETRY_INVALID",
            )

    starttls = values.get("starttls")
    ssl_tls = values.get("ssl_tls")
    if starttls is True and ssl_tls is True:
        raise BadRequest(
            message=_ts("MAIL_TRANSPORT_CONFLICT", "STARTTLS 与 SSL/TLS 不能同时开启"),
            error="MAIL_TRANSPORT_CONFLICT",
        )


def _validate_ai_agents_settings(values: JsonObject) -> None:
    _validate_optional_non_empty_string(values, "default_model", section_id="ai_agents")
    _validate_optional_string(values, "system_prompt", section_id="ai_agents")
    _validate_optional_string_choice(values, "default_mode", {"build", "plan", "agent"}, section_id="ai_agents")
    _validate_optional_string_choice(
        values,
        "reasoning_effort",
        {"low", "medium", "high"},
        section_id="ai_agents",
    )
    _validate_optional_positive_integer(values, "conversation_retention_days", section_id="ai_agents")
    _validate_optional_positive_integer(values, "monthly_budget_micros", section_id="ai_agents")
    _validate_optional_string_choice(
        values,
        "approval_policy",
        {"always_approve", "approve_bulk_only", "approve_schema_only", "auto_approved"},
        section_id="ai_agents",
    )
    allowed_skill_ids = values.get("allowed_skill_ids")
    if allowed_skill_ids is not None and (
        not isinstance(allowed_skill_ids, list)
        or any(not isinstance(item, str) or not item.strip() for item in allowed_skill_ids)
    ):
        _raise_config_invalid(section_id="ai_agents", field="allowed_skill_ids")


def _validate_langgraph_settings(values: JsonObject) -> None:
    _validate_optional_string_choice(values, "checkpointer", {"database", "memory"}, section_id="langgraph")
    _validate_optional_positive_integer(values, "checkpoint_ttl_days", section_id="langgraph")


_DOMAIN_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def _validate_domains_settings(values: JsonObject) -> None:
    base_domain = values.get("base_domain")
    if base_domain is not None:
        if not isinstance(base_domain, str) or not _is_valid_base_domain(base_domain):
            _raise_config_invalid(section_id="domains", field="base_domain")

    admin_subdomain = values.get("admin_subdomain")
    if admin_subdomain is not None:
        if not isinstance(admin_subdomain, str) or not _is_valid_domain_label(admin_subdomain):
            _raise_config_invalid(section_id="domains", field="admin_subdomain")

    auto_assign = values.get("auto_assign_project_subdomains")
    if auto_assign is not None and not isinstance(auto_assign, bool):
        _raise_config_invalid(section_id="domains", field="auto_assign_project_subdomains")

    reserved_labels = values.get("reserved_labels")
    if reserved_labels is not None:
        if not isinstance(reserved_labels, list) or any(
            not isinstance(item, str) or not _is_valid_domain_label(item) for item in reserved_labels
        ):
            _raise_config_invalid(section_id="domains", field="reserved_labels")


def _is_valid_base_domain(value: str) -> bool:
    normalized = value.strip().lower().strip(".")
    if not normalized or normalized.startswith("*.") or "*" in normalized:
        return False
    if len(normalized) > 253:
        return False
    labels = normalized.split(".")
    return len(labels) >= 2 and all(_is_valid_domain_label(label) for label in labels)


def _is_valid_domain_label(value: str) -> bool:
    normalized = value.strip().lower()
    return bool(_DOMAIN_LABEL_RE.fullmatch(normalized))


def _validate_optional_non_empty_string(values: JsonObject, field: str, *, section_id: str) -> None:
    value = values.get(field)
    if value is not None and (not isinstance(value, str) or not value.strip()):
        _raise_config_invalid(section_id=section_id, field=field)


def _validate_optional_string(values: JsonObject, field: str, *, section_id: str) -> None:
    value = values.get(field)
    if value is not None and not isinstance(value, str):
        _raise_config_invalid(section_id=section_id, field=field)


def _validate_optional_string_choice(
    values: JsonObject,
    field: str,
    choices: set[str],
    *,
    section_id: str,
) -> None:
    value = values.get(field)
    if value is not None and value not in choices:
        _raise_config_invalid(section_id=section_id, field=field)


def _validate_optional_positive_integer(values: JsonObject, field: str, *, section_id: str) -> None:
    value = values.get(field)
    if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value <= 0):
        _raise_config_invalid(section_id=section_id, field=field)


def _raise_config_invalid(*, section_id: str, field: str) -> None:
    raise BadRequest(
        message=_ts("CONFIG_ITEM_INVALID", "配置项不合法"),
        error="SETTINGS_CONFIG_INVALID",
        meta={"section": section_id, "field": field},
    )


def iter_secret_field_paths(schema: ConfigSchema) -> list[str]:
    paths: list[str] = []
    for section in schema.sections:
        for field in section.fields:
            if getattr(field, "secret", False):
                paths.append(f"{section.id}.{field.key}")
    return paths
