from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

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


class GraphQLFieldDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    field_name: str
    source_key: str
    scalar: GraphQLFieldScalar
    required: bool = False
    system: bool = True


class GraphQLQueryInputDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    input_name: str
    fields: tuple[str, ...]


class GraphQLQueryFilterDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    public_name: str
    field_key: str
    operator: Literal["exact", "contains"]


class GraphQLQuerySortDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    public_name: str
    field_key: str


class GraphQLSingleQueryDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    query_name: str
    argument: str
    resolver: str


class GraphQLModelSchemaDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    model_key: str
    entry_type: str
    list_query_name: str
    single_query: GraphQLSingleQueryDefinition
    filter_input: GraphQLQueryInputDefinition
    sort_input: GraphQLQueryInputDefinition
    filters: tuple[GraphQLQueryFilterDefinition, ...]
    sorts: tuple[GraphQLQuerySortDefinition, ...]
    system_fields: tuple[GraphQLFieldDefinition, ...]
    custom_fields_container: str
    schema_field_provider: str
    query_post_processor: str
    sdk_data_type: str
    sdk_variables_type: str

    @property
    def single_query_name(self) -> str:
        return self.single_query.query_name

    @property
    def single_query_argument(self) -> str:
        return self.single_query.argument


def _pascal_case(value: str) -> str:
    return "".join(part[:1].upper() + part[1:] for part in value.replace("_", "-").split("-") if part)


def _field_name(source_key: str) -> str:
    parts = source_key.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def _field_scalar(source_scalar: str) -> GraphQLFieldScalar:
    return _SCALAR_TO_GRAPHQL.get(source_scalar, "JSON")


def _build_model_schema(protocol: OfficialModelProtocol) -> GraphQLModelSchemaDefinition:
    pascal_key = _pascal_case(protocol.key)
    graphql_policy = protocol.graphql_policy
    return GraphQLModelSchemaDefinition(
        model_key=protocol.key,
        entry_type=graphql_policy.entry_type,
        list_query_name=graphql_policy.list_query,
        single_query=GraphQLSingleQueryDefinition(
            query_name=graphql_policy.single_query.name,
            argument=graphql_policy.single_query.argument,
            resolver=graphql_policy.single_query.resolver,
        ),
        filter_input=GraphQLQueryInputDefinition(
            input_name=f"{pascal_key}FilterInput",
            fields=tuple(item.public_name for item in graphql_policy.filters),
        ),
        sort_input=GraphQLQueryInputDefinition(
            input_name=f"{pascal_key}SortInput",
            fields=tuple(item.public_name for item in graphql_policy.sorts),
        ),
        filters=tuple(
            GraphQLQueryFilterDefinition(
                public_name=item.public_name,
                field_key=item.field_key,
                operator=item.operator,
            )
            for item in graphql_policy.filters
        ),
        sorts=tuple(
            GraphQLQuerySortDefinition(public_name=item.public_name, field_key=item.field_key)
            for item in graphql_policy.sorts
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
        custom_fields_container=graphql_policy.custom_fields_container,
        schema_field_provider=graphql_policy.schema_field_provider,
        query_post_processor=graphql_policy.query_post_processor,
        sdk_data_type=f"{pascal_key}EntriesQueryData",
        sdk_variables_type=f"{pascal_key}EntriesQueryVariables",
    )


def list_graphql_model_schemas() -> tuple[GraphQLModelSchemaDefinition, ...]:
    return tuple(
        _build_model_schema(protocol)
        for protocol in sorted(list_official_model_protocols(), key=lambda item: item.key)
        if protocol.graphql_policy.enabled
    )


def get_graphql_model_schema(model_key: str) -> GraphQLModelSchemaDefinition | None:
    return next((schema for schema in list_graphql_model_schemas() if schema.model_key == model_key), None)


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
                "singleQuery": {
                    "argument": model.single_query.argument,
                    "name": model.single_query.query_name,
                    "resolver": model.single_query.resolver,
                },
                "singleQueryArgument": model.single_query.argument,
                "singleQueryName": model.single_query.query_name,
                "sortInput": {
                    "fields": list(model.sort_input.fields),
                    "name": model.sort_input.input_name,
                },
                "queryContract": {
                    "filters": [
                        {
                            "fieldKey": item.field_key,
                            "operator": item.operator,
                            "publicName": item.public_name,
                        }
                        for item in model.filters
                    ],
                    "postProcessor": model.query_post_processor,
                    "schemaFieldProvider": model.schema_field_provider,
                    "sorts": [{"fieldKey": item.field_key, "publicName": item.public_name} for item in model.sorts],
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
