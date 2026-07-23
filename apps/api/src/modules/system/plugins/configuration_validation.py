from __future__ import annotations

import math
from collections.abc import Mapping

from pydantic import AnyUrl, TypeAdapter, ValidationError

from src.common.types.json_types import JsonObject, JsonValue
from src.modules.system.plugins.runtime_configuration import validate_secret_reference
from src.modules.system.plugins.schema import SystemConnectorDefinitionOut

_SUPPORTED_TYPES = frozenset({"boolean", "string", "number", "integer"})
_ROOT_SCHEMA_KEYS = frozenset({"type", "properties", "additionalProperties", "required", "title", "description"})
_PROPERTY_SCHEMA_KEYS = frozenset({
    "type",
    "format",
    "default",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "title",
    "description",
})
_SECRET_SCHEMA_KEYS = frozenset({
    "type",
    "writeOnly",
    "x-required-when-enabled",
    "title",
    "description",
})
_SECRET_ROOT_SCHEMA_KEYS = frozenset({
    "type",
    "properties",
    "additionalProperties",
    "required",
    "title",
    "description",
})
_URI_ADAPTER = TypeAdapter(AnyUrl)


class PluginConfigurationSchemaError(ValueError):
    """Raised when a plugin declares a configuration schema the host cannot enforce."""


class PluginConfigurationValueError(ValueError):
    def __init__(self, field_errors: Mapping[str, str]) -> None:
        self.field_errors = dict(field_errors)
        super().__init__("Plugin configuration contains invalid fields")


def validate_configuration_values(schema: JsonObject, values: JsonObject) -> JsonObject:
    properties, required = _configuration_properties(schema)
    errors: dict[str, str] = {}
    unknown = sorted(set(values) - set(properties))
    for field in unknown:
        errors[field] = "unknown_field"
    for field in sorted(required - set(values)):
        errors[field] = "required"
    for field, value in values.items():
        property_schema = properties.get(field)
        if property_schema is None:
            continue
        error = _validate_property_value(value, property_schema)
        if error is not None:
            errors[field] = error
    if errors:
        raise PluginConfigurationValueError(errors)
    return dict(values)


def validate_secret_references(
    connectors: list[SystemConnectorDefinitionOut],
    references: Mapping[str, str],
) -> dict[str, str]:
    supported_fields, required_fields = _secret_fields(connectors)
    errors: dict[str, str] = {}
    normalized: dict[str, str] = {}
    for field in sorted(required_fields - set(references)):
        errors[field] = "required_secret_reference"
    for field, reference in references.items():
        if field not in supported_fields:
            errors[field] = "unknown_secret_field"
            continue
        try:
            normalized[field] = validate_secret_reference(reference)
        except ValueError:
            errors[field] = "invalid_secret_reference"
    if errors:
        raise PluginConfigurationValueError(errors)
    return normalized


def _configuration_properties(schema: JsonObject) -> tuple[dict[str, JsonObject], set[str]]:
    if not schema:
        return {}, set()
    unsupported = sorted(set(schema) - _ROOT_SCHEMA_KEYS)
    if unsupported:
        raise PluginConfigurationSchemaError(f"Unsupported root schema constraints: {', '.join(unsupported)}")
    if schema.get("type") != "object":
        raise PluginConfigurationSchemaError("Plugin configuration schema type must be object")
    if schema.get("additionalProperties") is not False:
        raise PluginConfigurationSchemaError("Plugin configuration schema must set additionalProperties to false")
    raw_properties = schema.get("properties", {})
    if not isinstance(raw_properties, dict):
        raise PluginConfigurationSchemaError("Plugin configuration properties must be an object")
    properties: dict[str, JsonObject] = {}
    for field, field_schema in raw_properties.items():
        if not isinstance(field, str) or not isinstance(field_schema, dict):
            raise PluginConfigurationSchemaError("Plugin configuration property definitions must be objects")
        _validate_property_schema(field, field_schema)
        properties[field] = field_schema
    raw_required = schema.get("required", [])
    if not isinstance(raw_required, list) or not all(isinstance(field, str) for field in raw_required):
        raise PluginConfigurationSchemaError("Plugin configuration required must be a string array")
    required = set(raw_required)
    if unknown_required := sorted(required - set(properties)):
        raise PluginConfigurationSchemaError(
            f"Required configuration fields are not declared: {', '.join(unknown_required)}"
        )
    return properties, required


def _validate_property_schema(field: str, schema: JsonObject) -> None:
    unsupported = sorted(set(schema) - _PROPERTY_SCHEMA_KEYS)
    if unsupported:
        raise PluginConfigurationSchemaError(f"Unsupported constraints for {field}: {', '.join(unsupported)}")
    field_type = schema.get("type")
    if field_type not in _SUPPORTED_TYPES:
        raise PluginConfigurationSchemaError(f"Unsupported configuration type for {field}: {field_type}")
    field_format = schema.get("format")
    if field_format is not None and not (field_type == "string" and field_format == "uri"):
        raise PluginConfigurationSchemaError(f"Unsupported configuration format for {field}: {field_format}")
    for constraint in ("minimum", "maximum"):
        value = schema.get(constraint)
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
            raise PluginConfigurationSchemaError(f"{constraint} for {field} must be numeric")
    for constraint in ("minLength", "maxLength"):
        value = schema.get(constraint)
        if value is not None and (isinstance(value, bool) or not isinstance(value, int) or value < 0):
            raise PluginConfigurationSchemaError(f"{constraint} for {field} must be a non-negative integer")
    if "default" in schema:
        error = _validate_property_value(schema["default"], schema)
        if error is not None:
            raise PluginConfigurationSchemaError(f"Default value for {field} is invalid: {error}")


def _validate_property_value(value: JsonValue, schema: JsonObject) -> str | None:
    field_type = schema["type"]
    if field_type == "boolean":
        return None if isinstance(value, bool) else "expected_boolean"
    if field_type == "string":
        if not isinstance(value, str):
            return "expected_string"
        minimum_length = schema.get("minLength")
        maximum_length = schema.get("maxLength")
        if isinstance(minimum_length, int) and len(value) < minimum_length:
            return "string_too_short"
        if isinstance(maximum_length, int) and len(value) > maximum_length:
            return "string_too_long"
        if schema.get("format") == "uri":
            try:
                _URI_ADAPTER.validate_python(value)
            except ValidationError:
                return "invalid_uri"
        return None
    if field_type == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            return "expected_integer"
        return _validate_number_range(value, schema)
    if field_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            return "expected_number"
        return _validate_number_range(value, schema)
    return "unsupported_type"


def _validate_number_range(value: int | float, schema: JsonObject) -> str | None:
    minimum = schema.get("minimum")
    maximum = schema.get("maximum")
    if isinstance(minimum, (int, float)) and value < minimum:
        return "below_minimum"
    if isinstance(maximum, (int, float)) and value > maximum:
        return "above_maximum"
    return None


def _secret_fields(connectors: list[SystemConnectorDefinitionOut]) -> tuple[set[str], set[str]]:
    fields: set[str] = set()
    required_fields: set[str] = set()
    for connector in connectors:
        raw_schema = connector.secret_schema
        if not raw_schema:
            continue
        if "properties" in raw_schema:
            unsupported_root = sorted(set(raw_schema) - _SECRET_ROOT_SCHEMA_KEYS)
            if unsupported_root:
                raise PluginConfigurationSchemaError(
                    f"Unsupported secret root constraints for {connector.key}: {', '.join(unsupported_root)}"
                )
            if raw_schema.get("type") != "object" or raw_schema.get("additionalProperties") is not False:
                raise PluginConfigurationSchemaError(f"Secret schema for {connector.key} must be a closed object")
            raw_required = raw_schema.get("required", [])
            if not isinstance(raw_required, list) or not all(isinstance(field, str) for field in raw_required):
                raise PluginConfigurationSchemaError(
                    f"Secret required fields for {connector.key} must be a string array"
                )
            required_fields.update(raw_required)
        raw_properties = raw_schema.get("properties", raw_schema)
        if not isinstance(raw_properties, dict):
            raise PluginConfigurationSchemaError(
                f"Secret schema for {connector.key} must contain an object of properties"
            )
        for field, field_schema in raw_properties.items():
            if not isinstance(field, str) or not isinstance(field_schema, dict):
                raise PluginConfigurationSchemaError(
                    f"Secret schema property definitions for {connector.key} must be objects"
                )
            unsupported = sorted(set(field_schema) - _SECRET_SCHEMA_KEYS)
            if unsupported:
                raise PluginConfigurationSchemaError(
                    f"Unsupported secret constraints for {field}: {', '.join(unsupported)}"
                )
            if field_schema.get("type") != "string" or field_schema.get("writeOnly") is not True:
                raise PluginConfigurationSchemaError(f"Secret field {field} must be a write-only string reference")
            fields.add(field)
    if unknown_required := sorted(required_fields - fields):
        raise PluginConfigurationSchemaError(f"Required secret fields are not declared: {', '.join(unknown_required)}")
    return fields, required_fields
