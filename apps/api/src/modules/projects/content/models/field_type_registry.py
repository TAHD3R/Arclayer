from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any, cast

from src.core.exceptions import Conflict
from src.modules.projects.content.contracts.schema import (
    ContentModelCapability,
    ContentModelFieldContract,
    ContentModelFieldTypeDefinitionOut,
    ContentModelFieldTypeGroup,
    ContentModelFieldTypeRegistryOut,
    ContentModelKind,
    ContentModelKindDefinitionOut,
    ContentModelRelationContract,
    FieldScalarType,
    RelationType,
)

_CAMEL_CASE_FIELD_IDENTIFIER_PATTERN = re.compile(r"^[a-z][A-Za-z0-9]*$")
_GRAPHQL_RESERVED_FIELD_NAMES = frozenset({"sys", "contentfulMetadata", "linkedFrom", "__typename"})
_RELATION_TYPES: frozenset[RelationType] = frozenset({
    "one_to_one",
    "one_to_many",
    "many_to_one",
    "many_to_many",
    "one_way",
    "many_way",
    "morph_to_one",
    "morph_to_many",
    "morph_one",
    "morph_many",
})
_SINGLE_TARGET_RELATION_TYPES: frozenset[RelationType] = frozenset({
    "one_to_one",
    "many_to_one",
    "one_way",
    "morph_to_one",
    "morph_one",
})
_MULTI_TARGET_RELATION_TYPES: frozenset[RelationType] = _RELATION_TYPES - _SINGLE_TARGET_RELATION_TYPES
_OWNER_SIDE_POLYMORPHIC_RELATION_TYPES: frozenset[RelationType] = frozenset({"morph_to_one", "morph_to_many"})
_TARGET_SIDE_POLYMORPHIC_RELATION_TYPES: frozenset[RelationType] = frozenset({"morph_one", "morph_many"})
_POLYMORPHIC_RELATION_TYPES = _OWNER_SIDE_POLYMORPHIC_RELATION_TYPES | _TARGET_SIDE_POLYMORPHIC_RELATION_TYPES
_ONE_WAY_RELATION_TYPES: frozenset[RelationType] = frozenset({"one_way", "many_way"})
_PLUGIN_FIELD_TYPES: dict[str, ContentModelFieldTypeDefinitionOut] = {}


def _field_type(
    uid: str,
    *,
    scalar: FieldScalarType,
    group: str,
    icon: str,
    config_schema: dict[str, Any] | None = None,
    allowed_model_kinds: list[ContentModelKind] | None = None,
) -> ContentModelFieldTypeDefinitionOut:
    allowed_kinds: list[ContentModelKind]
    if allowed_model_kinds is None:
        allowed_kinds = ["collection_type", "single_type", "component"]
    else:
        allowed_kinds = allowed_model_kinds
    return ContentModelFieldTypeDefinitionOut(
        uid=uid,
        config_kind=uid,
        source="built_in",
        scalar=scalar,
        group=cast(ContentModelFieldTypeGroup, group),
        label_key=f"CONTENT_MODELS_FIELD_TYPE_{uid.upper()}_LABEL",
        description_key=f"CONTENT_MODELS_FIELD_TYPE_{uid.upper()}_DESC",
        icon=icon,
        config_schema=config_schema or {},
        settings_sections=["basic", "advanced"],
        allowed_model_kinds=allowed_kinds,
    )


_BUILT_IN_FIELD_TYPES: tuple[ContentModelFieldTypeDefinitionOut, ...] = (
    _field_type(
        "short_text",
        scalar="text",
        group="text",
        icon="type",
        config_schema={"properties": {"minLength": "integer", "maxLength": "integer", "pattern": "string"}},
    ),
    _field_type(
        "rich_text",
        scalar="long_text",
        group="text",
        icon="text",
        config_schema={"properties": {"minLength": "integer", "maxLength": "integer", "pattern": "string"}},
    ),
    _field_type(
        "markdown",
        scalar="long_text",
        group="text",
        icon="braces",
        config_schema={"properties": {"editor": "markdown", "minLength": "integer", "maxLength": "integer"}},
    ),
    _field_type(
        "slug",
        scalar="text",
        group="text",
        icon="link",
        config_schema={"properties": {"minLength": "integer", "maxLength": "integer", "pattern": "string"}},
    ),
    _field_type(
        "email",
        scalar="text",
        group="text",
        icon="at-sign",
        config_schema={"properties": {"minLength": "integer", "maxLength": "integer", "pattern": "string"}},
    ),
    _field_type(
        "password",
        scalar="text",
        group="text",
        icon="key-round",
        config_schema={"properties": {"minLength": "integer", "maxLength": "integer"}},
    ),
    _field_type(
        "number",
        scalar="number",
        group="value_logic",
        icon="hash",
        config_schema={"properties": {"numberFormat": ["integer", "decimal"], "min": "number", "max": "number"}},
    ),
    _field_type(
        "decimal",
        scalar="number",
        group="value_logic",
        icon="sigma",
        config_schema={"properties": {"min": "number", "max": "number", "decimalPlaces": "integer"}},
    ),
    _field_type(
        "biginteger",
        scalar="number",
        group="value_logic",
        icon="infinity",
        config_schema={"properties": {"min": "number", "max": "number"}},
    ),
    _field_type(
        "enumeration",
        scalar="text",
        group="value_logic",
        icon="list-checks",
        config_schema={"properties": {"options": "string[]"}},
    ),
    _field_type("date_time", scalar="date_time", group="time_media", icon="calendar"),
    _field_type("time", scalar="date_time", group="time_media", icon="clock"),
    _field_type("date", scalar="date_time", group="time_media", icon="calendar-days"),
    _field_type(
        "media",
        scalar="json",
        group="time_media",
        icon="image",
        config_schema={
            "properties": {
                "mediaMode": ["single", "multiple"],
                "mediaKind": ["image", "video", "file"],
                "allowedTypes": "string[]",
            }
        },
    ),
    _field_type("location", scalar="json", group="time_media", icon="map-pin"),
    _field_type(
        "boolean",
        scalar="boolean",
        group="value_logic",
        icon="toggle-left",
        config_schema={"properties": {"defaultValue": "boolean"}},
    ),
    _field_type("json_object", scalar="json", group="structure", icon="braces"),
    _field_type(
        "reference",
        scalar="json",
        group="structure",
        icon="waypoints",
        config_schema={"properties": {"referenceMode": ["single", "multiple"], "targetModelKey": "string"}},
        allowed_model_kinds=["collection_type", "single_type"],
    ),
    _field_type(
        "component",
        scalar="json",
        group="structure",
        icon="blocks",
        config_schema={"properties": {"targetComponentKey": "string"}},
    ),
    _field_type(
        "dynamic_zone",
        scalar="json",
        group="structure",
        icon="blocks",
        config_schema={"properties": {"components": "string[]", "min": "integer", "max": "integer"}},
    ),
    _field_type(
        "blocks",
        scalar="json",
        group="structure",
        icon="layout-grid",
        config_schema={"properties": {"allowedBlocks": "string[]", "min": "integer", "max": "integer"}},
    ),
)

_BUILT_IN_BY_KIND = {definition.config_kind: definition for definition in _BUILT_IN_FIELD_TYPES}


def list_content_model_kind_definitions() -> list[ContentModelKindDefinitionOut]:
    return [
        ContentModelKindDefinitionOut(
            id="collection_type",
            label_key="CONTENT_MODELS_KIND_COLLECTION_TYPE",
            description_key="CONTENT_MODELS_KIND_COLLECTION_TYPE_DESC",
            default_editor="form",
            default_capabilities=["queryable"],
        ),
        ContentModelKindDefinitionOut(
            id="single_type",
            label_key="CONTENT_MODELS_KIND_SINGLE_TYPE",
            description_key="CONTENT_MODELS_KIND_SINGLE_TYPE_DESC",
            default_editor="form",
            default_capabilities=["queryable"],
        ),
        ContentModelKindDefinitionOut(
            id="component",
            label_key="CONTENT_MODELS_KIND_COMPONENT",
            description_key="CONTENT_MODELS_KIND_COMPONENT_DESC",
            default_editor="form",
            default_capabilities=[],
        ),
    ]


def list_content_model_field_type_definitions() -> list[ContentModelFieldTypeDefinitionOut]:
    return [*_BUILT_IN_FIELD_TYPES, *sorted(_PLUGIN_FIELD_TYPES.values(), key=lambda item: item.uid)]


def content_model_field_type_registry() -> ContentModelFieldTypeRegistryOut:
    return ContentModelFieldTypeRegistryOut(
        model_kinds=list_content_model_kind_definitions(),
        field_types=list_content_model_field_type_definitions(),
    )


def register_custom_content_model_field_type(definition: ContentModelFieldTypeDefinitionOut) -> None:
    if definition.source != "plugin" or not definition.plugin_id:
        raise ValueError("Custom content model field types must be registered by a plugin")
    if definition.lifecycle == "disabled":
        raise ValueError("Disabled custom content model field types cannot be registered")
    _PLUGIN_FIELD_TYPES[definition.uid] = definition


def clear_custom_content_model_field_types(*, plugin_id: str | None = None) -> None:
    if plugin_id is None:
        _PLUGIN_FIELD_TYPES.clear()
        return
    for uid, definition in list(_PLUGIN_FIELD_TYPES.items()):
        if definition.plugin_id == plugin_id:
            _PLUGIN_FIELD_TYPES.pop(uid)


def _definition_for_field(field: ContentModelFieldContract) -> ContentModelFieldTypeDefinitionOut:
    config = field.config or {}
    kind = config.get("kind") if isinstance(config, dict) else None
    if kind == "custom":
        custom_uid = config.get("customFieldUid")
        if not isinstance(custom_uid, str) or not custom_uid.strip():
            raise Conflict(
                "Custom content model fields require a registered customFieldUid",
                error="CONTENT_MODEL_FIELD_CUSTOM_UID_REQUIRED",
                meta={"fieldKey": field.key},
            )
        definition = _PLUGIN_FIELD_TYPES.get(custom_uid.strip())
        if definition is None:
            raise Conflict(
                "Custom content model field type is not registered",
                error="CONTENT_MODEL_FIELD_TYPE_UNREGISTERED",
                meta={"fieldKey": field.key, "customFieldUid": custom_uid.strip()},
            )
        return definition
    if kind is None:
        return _default_definition_for_scalar(field.scalar)
    if not isinstance(kind, str):
        raise Conflict(
            "Content model field config.kind must be a string",
            error="CONTENT_MODEL_FIELD_KIND_INVALID",
            meta={"fieldKey": field.key},
        )
    definition = _BUILT_IN_BY_KIND.get(kind)
    if definition is None:
        raise Conflict(
            "Content model field type is not registered",
            error="CONTENT_MODEL_FIELD_TYPE_UNREGISTERED",
            meta={"fieldKey": field.key, "kind": kind},
        )
    return definition


def _default_definition_for_scalar(scalar: FieldScalarType) -> ContentModelFieldTypeDefinitionOut:
    fallback_kind_by_scalar = {
        "text": "short_text",
        "long_text": "rich_text",
        "number": "number",
        "boolean": "boolean",
        "date_time": "date_time",
        "json": "json_object",
    }
    return _BUILT_IN_BY_KIND[fallback_kind_by_scalar[scalar]]


def _assert_field_key(field: ContentModelFieldContract, *, system_field_keys: frozenset[str]) -> None:
    if field.key in _GRAPHQL_RESERVED_FIELD_NAMES:
        raise Conflict(
            "Content model field key is reserved by GraphQL delivery",
            error="CONTENT_MODEL_FIELD_KEY_RESERVED",
            meta={"fieldKey": field.key},
        )
    if field.key in system_field_keys:
        return
    if _CAMEL_CASE_FIELD_IDENTIFIER_PATTERN.fullmatch(field.key) is None:
        raise Conflict(
            "Content model field key must be a camelCase API identifier",
            error="CONTENT_MODEL_FIELD_KEY_INVALID",
            meta={"fieldKey": field.key},
        )


def _assert_scalar(field: ContentModelFieldContract, definition: ContentModelFieldTypeDefinitionOut) -> None:
    if field.scalar == definition.scalar:
        return
    raise Conflict(
        "Content model field scalar does not match the registered field type",
        error="CONTENT_MODEL_FIELD_SCALAR_MISMATCH",
        meta={"fieldKey": field.key, "expectedScalar": definition.scalar, "actualScalar": field.scalar},
    )


def _assert_enum_options(field: ContentModelFieldContract, config: dict[str, Any]) -> None:
    options = config.get("options")
    if (
        not isinstance(options, list)
        or not options
        or not all(isinstance(item, str) and item.strip() for item in options)
    ):
        raise Conflict(
            "Enumeration fields require at least one option",
            error="CONTENT_MODEL_FIELD_OPTIONS_INVALID",
            meta={"fieldKey": field.key},
        )
    normalized = [item.strip() for item in options]
    if len(set(normalized)) != len(normalized):
        raise Conflict(
            "Enumeration field options must be unique",
            error="CONTENT_MODEL_FIELD_OPTIONS_DUPLICATE",
            meta={"fieldKey": field.key},
        )


def _assert_text_validation(field: ContentModelFieldContract, config: dict[str, Any]) -> None:
    min_length = config.get("minLength")
    max_length = config.get("maxLength")
    if min_length is not None and (not isinstance(min_length, int) or min_length < 0):
        raise Conflict("minLength must be a positive integer", error="CONTENT_MODEL_FIELD_VALIDATION_INVALID")
    if max_length is not None and (not isinstance(max_length, int) or max_length < 0):
        raise Conflict("maxLength must be a positive integer", error="CONTENT_MODEL_FIELD_VALIDATION_INVALID")
    if isinstance(min_length, int) and isinstance(max_length, int) and min_length > max_length:
        raise Conflict("minLength cannot exceed maxLength", error="CONTENT_MODEL_FIELD_VALIDATION_INVALID")
    pattern = config.get("pattern")
    if pattern is None:
        return
    if not isinstance(pattern, str):
        raise Conflict("pattern must be a string", error="CONTENT_MODEL_FIELD_VALIDATION_INVALID")
    try:
        re.compile(pattern)
    except re.error as exc:
        raise Conflict(
            "pattern must be a valid regular expression",
            error="CONTENT_MODEL_FIELD_VALIDATION_INVALID",
            meta={"fieldKey": field.key, "message": str(exc)},
        ) from exc


def _assert_email_config(field: ContentModelFieldContract, config: dict[str, Any]) -> None:
    pattern = config.get("pattern")
    if pattern is None:
        return
    if not isinstance(pattern, str):
        raise Conflict("pattern must be a string", error="CONTENT_MODEL_FIELD_VALIDATION_INVALID")
    try:
        re.compile(pattern)
    except re.error as exc:
        raise Conflict(
            "pattern must be a valid regular expression",
            error="CONTENT_MODEL_FIELD_VALIDATION_INVALID",
            meta={"fieldKey": field.key, "message": str(exc)},
        ) from exc


def _assert_number_validation(config: dict[str, Any]) -> None:
    min_value = config.get("min")
    max_value = config.get("max")
    if min_value is not None and not isinstance(min_value, int | float):
        raise Conflict("min must be a number", error="CONTENT_MODEL_FIELD_VALIDATION_INVALID")
    if max_value is not None and not isinstance(max_value, int | float):
        raise Conflict("max must be a number", error="CONTENT_MODEL_FIELD_VALIDATION_INVALID")
    if isinstance(min_value, int | float) and isinstance(max_value, int | float) and min_value > max_value:
        raise Conflict("min cannot exceed max", error="CONTENT_MODEL_FIELD_VALIDATION_INVALID")


def _assert_decimal_validation(config: dict[str, Any]) -> None:
    _assert_number_validation(config)
    decimal_places = config.get("decimalPlaces")
    if decimal_places is not None and (not isinstance(decimal_places, int) or decimal_places < 0):
        raise Conflict("decimalPlaces must be a non-negative integer", error="CONTENT_MODEL_FIELD_CONFIG_INVALID")


def _assert_non_empty_string_list(value: Any, *, field: ContentModelFieldContract, config_key: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise Conflict(
            f"{config_key} must include at least one value",
            error="CONTENT_MODEL_FIELD_CONFIG_INVALID",
            meta={"fieldKey": field.key, "configKey": config_key},
        )
    normalized = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    if len(normalized) != len(value) or len(set(normalized)) != len(normalized):
        raise Conflict(
            f"{config_key} values must be unique strings",
            error="CONTENT_MODEL_FIELD_CONFIG_INVALID",
            meta={"fieldKey": field.key, "configKey": config_key},
        )
    return normalized


def _assert_dynamic_zone_validation(field: ContentModelFieldContract, config: dict[str, Any]) -> None:
    _assert_non_empty_string_list(config.get("components"), field=field, config_key="components")
    _assert_number_validation(config)


def _assert_media_allowed_types(field: ContentModelFieldContract, config: dict[str, Any]) -> None:
    allowed_types = config.get("allowedTypes")
    if allowed_types is None:
        return
    normalized = _assert_non_empty_string_list(allowed_types, field=field, config_key="allowedTypes")
    invalid = [item for item in normalized if item not in {"images", "videos", "files"}]
    if invalid:
        raise Conflict(
            "allowedTypes values must be images, videos, or files",
            error="CONTENT_MODEL_FIELD_CONFIG_INVALID",
            meta={"fieldKey": field.key, "configKey": "allowedTypes"},
        )


def _assert_common_config(field: ContentModelFieldContract, config: dict[str, Any]) -> None:
    for key in ("localizable", "unique", "hiddenInEditor", "omitFromApiResponse"):
        value = config.get(key)
        if value is not None and not isinstance(value, bool):
            raise Conflict(
                f"{key} must be a boolean",
                error="CONTENT_MODEL_FIELD_CONFIG_INVALID",
                meta={"fieldKey": field.key, "configKey": key},
            )


def validate_content_model_field_contract(
    field: ContentModelFieldContract,
    *,
    model_kind: ContentModelKind,
    system_field_keys: frozenset[str] = frozenset(),
) -> None:
    _assert_field_key(field, system_field_keys=system_field_keys)
    definition = _definition_for_field(field)
    _assert_scalar(field, definition)
    if definition.lifecycle != "active":
        raise Conflict(
            "Content model field type is not active",
            error="CONTENT_MODEL_FIELD_TYPE_INACTIVE",
            meta={"fieldKey": field.key, "fieldTypeUid": definition.uid},
        )
    if model_kind not in definition.allowed_model_kinds:
        raise Conflict(
            "Content model field type is not available for this model kind",
            error="CONTENT_MODEL_FIELD_TYPE_MODEL_KIND_UNSUPPORTED",
            meta={"fieldKey": field.key, "modelKind": model_kind, "fieldTypeUid": definition.uid},
        )

    config = field.config or {}
    if not isinstance(config, dict):
        raise Conflict("Content model field config must be an object", error="CONTENT_MODEL_FIELD_CONFIG_INVALID")
    _assert_common_config(field, config)

    if definition.config_kind in {"short_text", "rich_text", "markdown", "slug", "email", "password"}:
        _assert_text_validation(field, config)
    if definition.config_kind == "email":
        _assert_email_config(field, config)
    if definition.config_kind == "number":
        _assert_number_validation(config)
    if definition.config_kind == "decimal":
        _assert_decimal_validation(config)
    if definition.config_kind == "biginteger":
        _assert_number_validation(config)
    if definition.config_kind == "enumeration":
        _assert_enum_options(field, config)
    if (
        definition.config_kind == "boolean"
        and "defaultValue" in config
        and not isinstance(config["defaultValue"], bool)
    ):
        raise Conflict("Boolean defaultValue must be a boolean", error="CONTENT_MODEL_FIELD_CONFIG_INVALID")
    if definition.config_kind == "reference":
        target_model_key = config.get("targetModelKey")
        if not isinstance(target_model_key, str) or not target_model_key.strip():
            raise Conflict(
                "Reference fields require targetModelKey",
                error="CONTENT_MODEL_FIELD_REFERENCE_TARGET_REQUIRED",
                meta={"fieldKey": field.key},
            )
    if definition.config_kind == "media":
        if config.get("mediaMode") not in (None, "single", "multiple"):
            raise Conflict("mediaMode must be single or multiple", error="CONTENT_MODEL_FIELD_CONFIG_INVALID")
        if config.get("mediaKind") not in (None, "image", "video", "file"):
            raise Conflict("mediaKind must be image, video, or file", error="CONTENT_MODEL_FIELD_CONFIG_INVALID")
        _assert_media_allowed_types(field, config)
    if definition.config_kind == "component":
        target_component_key = config.get("targetComponentKey")
        if not isinstance(target_component_key, str) or not target_component_key.strip():
            raise Conflict(
                "Component fields require targetComponentKey",
                error="CONTENT_MODEL_FIELD_COMPONENT_TARGET_REQUIRED",
                meta={"fieldKey": field.key},
            )
    if definition.config_kind == "dynamic_zone":
        _assert_dynamic_zone_validation(field, config)
    if definition.config_kind == "blocks":
        allowed_blocks = config.get("allowedBlocks")
        if allowed_blocks is not None:
            _assert_non_empty_string_list(allowed_blocks, field=field, config_key="allowedBlocks")
        _assert_number_validation(config)


def validate_content_model_field_contracts(
    fields: Iterable[ContentModelFieldContract],
    *,
    model_kind: ContentModelKind,
    system_field_keys: Iterable[str] = (),
) -> None:
    normalized_system_field_keys = frozenset(str(key) for key in system_field_keys)
    seen: set[str] = set()
    for field in fields:
        validate_content_model_field_contract(
            field,
            model_kind=model_kind,
            system_field_keys=normalized_system_field_keys,
        )
        if field.key in seen:
            raise Conflict(
                "Content model field keys must be unique",
                error="CONTENT_MODEL_FIELD_DUPLICATE",
                meta={"fieldKey": field.key},
            )
        seen.add(field.key)


def _assert_relation_key(relation: ContentModelRelationContract) -> None:
    if _CAMEL_CASE_FIELD_IDENTIFIER_PATTERN.fullmatch(relation.key) is not None:
        return
    raise Conflict(
        "Content model relation key must be a camelCase API identifier",
        error="CONTENT_MODEL_RELATION_KEY_INVALID",
        meta={"relationKey": relation.key},
    )


def _assert_relation_config_object(relation: ContentModelRelationContract) -> dict[str, Any]:
    if relation.config is None:
        return {}
    config = relation.config
    if isinstance(config, dict):
        return config
    raise Conflict(
        "Content model relation config must be an object",
        error="CONTENT_MODEL_RELATION_CONFIG_INVALID",
        meta={"relationKey": relation.key},
    )


def _assert_boolean_config_value(
    config: dict[str, Any],
    *,
    key: str,
    relation: ContentModelRelationContract,
) -> None:
    value = config.get(key)
    if value is None or isinstance(value, bool):
        return
    raise Conflict(
        f"Content model relation config.{key} must be a boolean",
        error="CONTENT_MODEL_RELATION_CONFIG_INVALID",
        meta={"relationKey": relation.key, "configKey": key},
    )


def _assert_string_config_value(
    config: dict[str, Any],
    *,
    key: str,
    relation: ContentModelRelationContract,
) -> None:
    value = config.get(key)
    if isinstance(value, str) and value.strip():
        return
    raise Conflict(
        f"Content model relation config.{key} is required",
        error="CONTENT_MODEL_RELATION_CONFIG_REQUIRED",
        meta={"relationKey": relation.key, "relation": relation.relation, "configKey": key},
    )


def _assert_relation_cardinality(
    relation: ContentModelRelationContract,
    config: dict[str, Any],
) -> None:
    expected_cardinality = "many" if relation.relation in _MULTI_TARGET_RELATION_TYPES else "one"
    cardinality = config.get("cardinality")
    if cardinality is None or cardinality == expected_cardinality:
        return
    raise Conflict(
        "Content model relation cardinality does not match relation type",
        error="CONTENT_MODEL_RELATION_CARDINALITY_MISMATCH",
        meta={
            "relationKey": relation.key,
            "relation": relation.relation,
            "expectedCardinality": expected_cardinality,
            "actualCardinality": cardinality,
        },
    )


def _assert_one_way_relation_config(
    relation: ContentModelRelationContract,
    config: dict[str, Any],
) -> None:
    if relation.relation not in _ONE_WAY_RELATION_TYPES:
        return
    _assert_boolean_config_value(config, key="inverseEditable", relation=relation)
    if config.get("inverseEditable") is not True:
        return
    raise Conflict(
        "One-way relations cannot declare an editable inverse side",
        error="CONTENT_MODEL_RELATION_ONE_WAY_INVERSE_INVALID",
        meta={"relationKey": relation.key, "relation": relation.relation},
    )


def _assert_polymorphic_relation_config(
    relation: ContentModelRelationContract,
    config: dict[str, Any],
) -> None:
    relation_type = relation.relation
    if relation_type not in _POLYMORPHIC_RELATION_TYPES:
        return
    if relation_type in _OWNER_SIDE_POLYMORPHIC_RELATION_TYPES:
        _assert_string_config_value(config, key="targetDiscriminatorField", relation=relation)
    if relation_type in _TARGET_SIDE_POLYMORPHIC_RELATION_TYPES:
        _assert_string_config_value(config, key="sourceDiscriminatorField", relation=relation)
    _assert_boolean_config_value(config, key="polymorphic", relation=relation)
    if config.get("polymorphic") in (None, True):
        return
    raise Conflict(
        "Polymorphic relations must set config.polymorphic to true when provided",
        error="CONTENT_MODEL_RELATION_POLYMORPHIC_FLAG_INVALID",
        meta={"relationKey": relation.key, "relation": relation_type},
    )


def validate_content_model_relation_contract(relation: ContentModelRelationContract) -> None:
    _assert_relation_key(relation)
    config = _assert_relation_config_object(relation)
    relation_type = relation.relation
    if relation_type not in _RELATION_TYPES:
        raise Conflict(
            "Content model relation type is not supported",
            error="CONTENT_MODEL_RELATION_TYPE_UNSUPPORTED",
            meta={"relationKey": relation.key, "relation": relation_type},
        )

    _assert_relation_cardinality(relation, config)
    _assert_one_way_relation_config(relation, config)
    _assert_polymorphic_relation_config(relation, config)


def validate_content_model_relation_contracts(relations: Iterable[ContentModelRelationContract]) -> None:
    seen: set[str] = set()
    for relation in relations:
        validate_content_model_relation_contract(relation)
        if relation.key in seen:
            raise Conflict(
                "Content model relation keys must be unique",
                error="CONTENT_MODEL_RELATION_DUPLICATE",
                meta={"relationKey": relation.key},
            )
        seen.add(relation.key)


def validate_model_kind_contract(
    *,
    model_kind: ContentModelKind,
    capabilities: Iterable[ContentModelCapability],
    routing_mode: str | None,
) -> None:
    capability_set = {str(capability) for capability in capabilities}
    if model_kind != "component":
        return
    delivery_capabilities = {"queryable", "routable", "treeable", "publishable", "schedulable", "seo_managed"}
    blocked = sorted(capability_set & delivery_capabilities)
    if blocked or routing_mode not in (None, "none"):
        raise Conflict(
            "Component models are embedded schemas and cannot declare delivery routing capabilities",
            error="CONTENT_MODEL_COMPONENT_DELIVERY_UNSUPPORTED",
            meta={"capabilities": blocked, "routingMode": routing_mode},
        )
