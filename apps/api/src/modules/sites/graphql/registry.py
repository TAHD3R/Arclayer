from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from src.modules.projects.content.models.protocol_registry import (
    OfficialModelProtocol,
    list_official_model_protocols,
)

GraphQLFieldScalar = Literal["String", "Int", "Float", "Boolean", "JSON"]

_SCALAR_TO_GRAPHQL: dict[str, GraphQLFieldScalar] = {
    "boolean": "Boolean",
    "date_time": "String",
    "json": "JSON",
    "long_text": "String",
    "number": "Float",
    "text": "String",
}


@dataclass(frozen=True, slots=True)
class GraphQLFieldDefinition:
    field_name: str
    source_key: str
    scalar: GraphQLFieldScalar
    required: bool = False
    system: bool = True


@dataclass(frozen=True, slots=True)
class GraphQLQueryInputDefinition:
    input_name: str
    fields: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class GraphQLModelSchemaDefinition:
    model_key: str
    entry_type: str
    list_query_name: str
    single_query_name: str
    single_query_argument: str
    filter_input: GraphQLQueryInputDefinition
    sort_input: GraphQLQueryInputDefinition
    system_fields: tuple[GraphQLFieldDefinition, ...]
    custom_fields_container: str
    sdk_data_type: str
    sdk_variables_type: str


_ENTRY_TYPE_BY_MODEL_KEY = {
    "article": "ArticleEntry",
    "category": "CategoryEntry",
    "page": "PageEntry",
    "reusable-section": "ReusableSectionEntry",
}

_LIST_QUERY_BY_MODEL_KEY = {
    "article": "articles",
    "category": "categories",
    "page": "pages",
    "reusable-section": "reusableSections",
}

_SINGLE_QUERY_BY_MODEL_KEY = {
    "article": ("articleBySlug", "slug"),
    "category": ("categoryBySlug", "slug"),
    "page": ("pageEntryByPath", "path"),
    "reusable-section": ("reusableSectionByAlias", "alias"),
}

_FILTER_FIELDS_BY_MODEL_KEY = {
    "article": ("slug", "titleContains", "revisionState"),
    "category": ("slug", "nameContains", "revisionState"),
    "page": ("path", "titleContains", "revisionState"),
    "reusable-section": ("sectionKey", "titleContains", "revisionState"),
}

_SORT_FIELDS_BY_MODEL_KEY = {
    "article": ("TITLE", "SLUG", "REVISION"),
    "category": ("NAME", "SLUG", "REVISION"),
    "page": ("TITLE", "PATH", "REVISION"),
    "reusable-section": ("TITLE", "SECTION_KEY", "REVISION"),
}


def _pascal_case(value: str) -> str:
    return "".join(part[:1].upper() + part[1:] for part in value.replace("_", "-").split("-") if part)


def _field_name(source_key: str) -> str:
    parts = source_key.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def _field_scalar(source_scalar: str) -> GraphQLFieldScalar:
    return _SCALAR_TO_GRAPHQL.get(source_scalar, "JSON")


def _build_model_schema(protocol: OfficialModelProtocol) -> GraphQLModelSchemaDefinition:
    single_query_name, single_query_argument = _SINGLE_QUERY_BY_MODEL_KEY[protocol.key]
    pascal_key = _pascal_case(protocol.key)
    return GraphQLModelSchemaDefinition(
        model_key=protocol.key,
        entry_type=_ENTRY_TYPE_BY_MODEL_KEY[protocol.key],
        list_query_name=_LIST_QUERY_BY_MODEL_KEY[protocol.key],
        single_query_name=single_query_name,
        single_query_argument=single_query_argument,
        filter_input=GraphQLQueryInputDefinition(
            input_name=f"{pascal_key}FilterInput",
            fields=_FILTER_FIELDS_BY_MODEL_KEY[protocol.key],
        ),
        sort_input=GraphQLQueryInputDefinition(
            input_name=f"{pascal_key}SortInput",
            fields=_SORT_FIELDS_BY_MODEL_KEY[protocol.key],
        ),
        system_fields=tuple(
            GraphQLFieldDefinition(
                field_name=_field_name(field.key),
                source_key=field.key,
                scalar=_field_scalar(field.scalar),
                required=field.required,
            )
            for field in protocol.system_fields
        ),
        custom_fields_container="customFields",
        sdk_data_type=f"{pascal_key}EntriesQueryData",
        sdk_variables_type=f"{pascal_key}EntriesQueryVariables",
    )


def list_graphql_model_schemas() -> tuple[GraphQLModelSchemaDefinition, ...]:
    return tuple(
        _build_model_schema(protocol)
        for protocol in sorted(list_official_model_protocols(), key=lambda item: item.key)
        if protocol.key in _ENTRY_TYPE_BY_MODEL_KEY
    )


def graphql_schema_registry_manifest() -> dict[str, object]:
    return {
        "models": [
            {
                "customFieldsContainer": model.custom_fields_container,
                "entryType": model.entry_type,
                "filterInput": {
                    "fields": list(model.filter_input.fields),
                    "name": model.filter_input.input_name,
                },
                "listQueryName": model.list_query_name,
                "modelKey": model.model_key,
                "sdkDataType": model.sdk_data_type,
                "sdkVariablesType": model.sdk_variables_type,
                "singleQueryArgument": model.single_query_argument,
                "singleQueryName": model.single_query_name,
                "sortInput": {
                    "fields": list(model.sort_input.fields),
                    "name": model.sort_input.input_name,
                },
                "systemFields": [
                    {
                        "fieldName": field.field_name,
                        "required": field.required,
                        "scalar": field.scalar,
                        "sourceKey": field.source_key,
                    }
                    for field in model.system_fields
                ],
            }
            for model in list_graphql_model_schemas()
        ]
    }
