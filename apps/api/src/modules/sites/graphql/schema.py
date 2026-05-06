from __future__ import annotations

import enum
import inspect
import re
from typing import Any, cast
from uuid import UUID

import strawberry
from graphql import GraphQLError
from pydantic import BaseModel, ConfigDict
from strawberry.scalars import JSON

from src.common.types.json_types import JsonValue
from src.core.exceptions import APIError
from src.modules.sites.delivery.schema import DeliveryGlobalSetOut, DeliveryPageOut, DeliverySectionOut
from src.modules.sites.graphql.registry import (
    GraphQLModelSchemaDefinition,
    get_graphql_model_schema,
    list_graphql_model_schemas,
)
from src.modules.sites.graphql.service import (
    GraphQLPerspective,
    SiteGraphQLContext,
    StructuredContentRecord,
    _extract_system_field,
    graphql_error_extensions,
)

_SCHEMA_BY_MODEL_KEY: dict[str, GraphQLModelSchemaDefinition] = {
    schema.model_key: schema for schema in list_graphql_model_schemas()
}
_GRAPHQL_SCALAR_TYPES: dict[str, Any] = {
    "Boolean": bool,
    "Float": float,
    "Int": int,
    "JSON": JSON,
    "String": str,
}
_QUERY_MODEL_ORDER: tuple[str, ...] = ("article", "page", "reusable-section", "category")
_GRAPHQL_PYTHON_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class Perspective(enum.Enum):
    PUBLISHED = "published"
    PREVIEW = "preview"


DeliveryPerspectiveEnum = strawberry.enum(Perspective, name="DeliveryPerspective")


@strawberry.type
class GraphQLResolveWarning:
    code: str
    message: str
    ref_entry_id: str | None
    ref_node_id: str | None


@strawberry.type
class GraphQLPageMeta:
    title: str | None
    description: str | None


@strawberry.type
class GraphQLRouteMatch:
    kind: str
    params: JSON
    page_id: str | None
    variant_id: str | None
    revision: int | None
    revision_state: str | None
    draft_revision: int | None
    published_revision: int | None


@strawberry.type
class GraphQLPrimaryContext:
    id: str
    model_key: str | None
    slug: str | None
    title: str | None
    data: JSON


@strawberry.type
class GraphQLRouteContext:
    primary: GraphQLPrimaryContext | None
    route_params: JSON


@strawberry.type
class GraphQLFlattenedSection:
    id: str
    component_key: str
    props: JSON


@strawberry.type
class GraphQLFlattenedPage:
    path: str
    layout: JSON | None
    sections: list[GraphQLFlattenedSection]


@strawberry.type
class GraphQLDeliveryPage:
    match: GraphQLRouteMatch
    page_meta: GraphQLPageMeta | None
    document: GraphQLFlattenedPage | None
    context: GraphQLRouteContext | None
    warnings: list[GraphQLResolveWarning] | None


@strawberry.type
class GraphQLDeliverySectionDocument:
    layout: JSON | None
    sections: list[GraphQLFlattenedSection]


@strawberry.type
class GraphQLDeliverySection:
    id: str
    alias: str
    title: str | None
    revision: int
    revision_state: str
    draft_revision: int
    published_revision: int | None
    document: GraphQLDeliverySectionDocument
    warnings: list[GraphQLResolveWarning] | None


@strawberry.type
class GraphQLGlobalSetItem:
    id: str
    name: str
    key: str
    payload: JSON | None
    section_alias: str | None
    section: GraphQLDeliverySection | None


@strawberry.type
class GraphQLGlobalSet:
    key: str
    items: list[GraphQLGlobalSetItem]


@strawberry.enum
class GraphQLSortDirection(enum.Enum):
    ASC = "asc"
    DESC = "desc"


class GraphQLModelRuntimeTypes(BaseModel):
    model_config = ConfigDict(frozen=True)
    entry_type: type[object]
    filter_input_type: type[object]
    sort_enum: type[enum.Enum]
    sort_input_type: type[object]


def _snake_case(value: str) -> str:
    chars: list[str] = []
    for index, char in enumerate(value):
        if char.isupper() and index > 0:
            chars.append("_")
        chars.append(char.lower())
    return "".join(chars)


def _optional_annotation(annotation: Any) -> object:
    return annotation | None


def _assert_graphql_identifier(value: str, *, label: str) -> str:
    if not _GRAPHQL_PYTHON_IDENTIFIER_RE.fullmatch(value):
        raise ValueError(f"Invalid GraphQL {label}: {value!r}")
    return value


def _assert_graphql_type_name(value: str, *, label: str) -> str:
    return _assert_graphql_identifier(value, label=label)


def _assert_graphql_field_name(value: str, *, label: str) -> str:
    return _assert_graphql_identifier(value, label=label)


def _sort_enum_name(schema: GraphQLModelSchemaDefinition) -> str:
    return schema.sort_input.input_name.removesuffix("Input") + "Field"


def _build_entry_type(schema: GraphQLModelSchemaDefinition) -> type[Any]:
    entry_type_name = _assert_graphql_type_name(schema.entry_type, label="entry type name")
    annotations: dict[str, object] = {
        "id": str,
        "locale": str,
        "revision": int,
        "revision_state": str,
        "draft_revision": int,
        "published_revision": int | None,
    }
    for field in schema.system_fields:
        field_annotation = _GRAPHQL_SCALAR_TYPES[field.scalar]
        field_name = _assert_graphql_field_name(_snake_case(field.field_name), label="entry field name")
        annotations[field_name] = _optional_annotation(field_annotation)
    annotations["custom_fields"] = JSON
    entry_type = strawberry.type(type(entry_type_name, (), {"__annotations__": annotations, "__module__": __name__}))
    globals()[entry_type_name] = entry_type
    return entry_type


def _build_filter_input_type(schema: GraphQLModelSchemaDefinition) -> type[Any]:
    input_name = _assert_graphql_type_name(schema.filter_input.input_name, label="filter input type name")
    field_names = tuple(
        _assert_graphql_field_name(_snake_case(item.public_name), label="filter field name") for item in schema.filters
    )
    annotations = dict.fromkeys(field_names, str | None)
    attrs: dict[str, object] = {"__annotations__": annotations, "__module__": __name__}
    attrs.update(dict.fromkeys(field_names))
    input_type = strawberry.input(type(input_name, (), attrs))
    globals()[input_name] = input_type
    return input_type


def _build_sort_enum(schema: GraphQLModelSchemaDefinition) -> type[enum.Enum]:
    enum_name = _assert_graphql_type_name(_sort_enum_name(schema), label="sort enum type name")
    enum_values = {
        _assert_graphql_field_name(item.public_name, label="sort enum value"): item.field_key for item in schema.sorts
    }
    sort_enum = strawberry.enum(enum.Enum(enum_name, enum_values))
    globals()[sort_enum.__name__] = sort_enum
    return sort_enum


def _build_sort_input_type(schema: GraphQLModelSchemaDefinition, sort_enum: type[enum.Enum]) -> type[Any]:
    input_name = _assert_graphql_type_name(schema.sort_input.input_name, label="sort input type name")
    input_type = strawberry.input(
        type(
            input_name,
            (),
            {
                "__annotations__": {
                    "field": sort_enum,
                    "direction": GraphQLSortDirection,
                },
                "__module__": __name__,
                "direction": GraphQLSortDirection.ASC,
            },
        )
    )
    globals()[input_name] = input_type
    return input_type


def _build_model_runtime_types() -> dict[str, GraphQLModelRuntimeTypes]:
    runtime_types: dict[str, GraphQLModelRuntimeTypes] = {}
    for schema in list_graphql_model_schemas():
        entry_type = _build_entry_type(schema)
        filter_input_type = _build_filter_input_type(schema)
        sort_enum = _build_sort_enum(schema)
        sort_input_type = _build_sort_input_type(schema, sort_enum)
        runtime_types[schema.model_key] = GraphQLModelRuntimeTypes(
            entry_type=entry_type,
            filter_input_type=filter_input_type,
            sort_enum=sort_enum,
            sort_input_type=sort_input_type,
        )
    return runtime_types


_MODEL_RUNTIME_TYPES = _build_model_runtime_types()


def _exact_filters(payload: dict[str, str | None]) -> dict[str, str]:
    return {key: value.strip() for key, value in payload.items() if isinstance(value, str) and value.strip()}


def _contains_filters(payload: dict[str, str | None]) -> dict[str, str]:
    return {key: value.strip().lower() for key, value in payload.items() if isinstance(value, str) and value.strip()}


def _required_model_schema(model_key: str) -> GraphQLModelSchemaDefinition:
    schema = _SCHEMA_BY_MODEL_KEY.get(model_key) or get_graphql_model_schema(model_key)
    if schema is None:
        raise RuntimeError(f"GraphQL model schema is not registered: {model_key}")
    return schema


def _query_filter_payload(model_key: str, filter_input: object | None, operator: str) -> dict[str, str]:
    if filter_input is None:
        return {}
    schema = _required_model_schema(model_key)
    payload: dict[str, str | None] = {}
    for definition in schema.filters:
        if definition.operator != operator:
            continue
        payload[definition.field_key] = getattr(filter_input, _snake_case(definition.public_name), None)
    if operator == "contains":
        return _contains_filters(payload)
    return _exact_filters(payload)


def _raise_graphql_error(exc: APIError) -> None:
    raise GraphQLError(exc.message, extensions=graphql_error_extensions(exc)) from exc


def _as_json(value: dict[str, JsonValue] | dict[str, Any]) -> JSON:
    return cast(JSON, value)


def _as_optional_json(value: dict[str, JsonValue] | dict[str, Any] | None) -> JSON | None:
    return cast(JSON | None, value)


async def _require_access(
    info: strawberry.Info[SiteGraphQLContext, None],
    *,
    perspective: Perspective,
    preview_token: str | None,
) -> GraphQLPerspective:
    try:
        await info.context.graphql.resolve_query_access(
            runtime_id=info.context.runtime_id,
            request=info.context.request,
            perspective=perspective.value,
            preview_token=preview_token,
        )
    except APIError as exc:
        _raise_graphql_error(exc)
    return perspective.value


def _to_warning_list(warnings: list[Any] | None) -> list[GraphQLResolveWarning] | None:
    if not warnings:
        return None
    return [
        GraphQLResolveWarning(
            code=str(warning.code),
            message=str(warning.message),
            ref_entry_id=warning.ref_entry_id,
            ref_node_id=warning.ref_node_id,
        )
        for warning in warnings
    ]


def _to_delivery_page(payload: DeliveryPageOut | None) -> GraphQLDeliveryPage | None:
    if payload is None:
        return None
    return GraphQLDeliveryPage(
        match=GraphQLRouteMatch(
            kind=str(payload.match.kind),
            params=_as_json(payload.match.params),
            page_id=str(payload.match.page_id) if payload.match.page_id is not None else None,
            variant_id=payload.match.variant_id,
            revision=payload.match.revision,
            revision_state=payload.match.revision_state,
            draft_revision=payload.match.draft_revision,
            published_revision=payload.match.published_revision,
        ),
        page_meta=(
            GraphQLPageMeta(title=payload.page_meta.title, description=payload.page_meta.description)
            if payload.page_meta is not None
            else None
        ),
        document=(
            GraphQLFlattenedPage(
                path=payload.document.path,
                layout=_as_optional_json(payload.document.layout),
                sections=[
                    GraphQLFlattenedSection(
                        id=section.id,
                        component_key=section.component_key,
                        props=_as_json(section.props),
                    )
                    for section in payload.document.sections
                ],
            )
            if payload.document is not None
            else None
        ),
        context=(
            GraphQLRouteContext(
                primary=(
                    GraphQLPrimaryContext(
                        id=str(payload.context.primary.id),
                        model_key=payload.context.primary.model_key,
                        slug=payload.context.primary.slug,
                        title=payload.context.primary.title,
                        data=_as_json(payload.context.primary.data),
                    )
                    if payload.context.primary is not None
                    else None
                ),
                route_params=_as_json(payload.context.route_params),
            )
            if payload.context is not None
            else None
        ),
        warnings=_to_warning_list(payload.warnings),
    )


def _to_delivery_section(payload: DeliverySectionOut) -> GraphQLDeliverySection:
    return GraphQLDeliverySection(
        id=str(payload.id),
        alias=payload.alias,
        title=payload.title,
        revision=payload.revision,
        revision_state=payload.revision_state,
        draft_revision=payload.draft_revision,
        published_revision=payload.published_revision,
        document=GraphQLDeliverySectionDocument(
            layout=_as_optional_json(payload.document.layout),
            sections=[
                GraphQLFlattenedSection(
                    id=section.id,
                    component_key=section.component_key,
                    props=_as_json(section.props),
                )
                for section in payload.document.sections
            ],
        ),
        warnings=_to_warning_list(payload.warnings),
    )


def _to_global_set(payload: DeliveryGlobalSetOut) -> GraphQLGlobalSet:
    return GraphQLGlobalSet(
        key=payload.key,
        items=[
            GraphQLGlobalSetItem(
                id=item.id,
                name=item.name,
                key=item.key,
                payload=_as_optional_json(item.payload),
                section_alias=item.section_alias,
                section=_to_delivery_section(item.section) if item.section is not None else None,
            )
            for item in payload.items
        ],
    )


def _page_entry_field_value(record: StructuredContentRecord, field_key: str) -> Any:
    if field_key == "path":
        return record.route_path or _extract_system_field(model_key="page", fields=record.fields, field_key=field_key)
    route_pattern = (
        record.route_path if record.route_contract and record.route_contract.get("mode") == "dynamic" else None
    )
    if field_key == "route_pattern":
        return route_pattern or _extract_system_field(model_key="page", fields=record.fields, field_key=field_key)
    return _extract_system_field(model_key="page", fields=record.fields, field_key=field_key)


def _model_entry_field_value(model_key: str, field_key: str, record: StructuredContentRecord) -> Any:
    if model_key == "page":
        return _page_entry_field_value(record, field_key)
    return _extract_system_field(model_key=model_key, fields=record.fields, field_key=field_key)


def _to_model_entry(model_key: str, record: StructuredContentRecord) -> Any:
    schema = _required_model_schema(model_key)
    runtime_types = _MODEL_RUNTIME_TYPES[model_key]
    entry_type = cast(Any, runtime_types.entry_type)
    payload: dict[str, Any] = {
        "id": str(record.item_id),
        "locale": record.locale,
        "revision": record.revision,
        "revision_state": record.revision_state,
        "draft_revision": record.draft_revision,
        "published_revision": record.published_revision,
        "custom_fields": _as_json(record.custom_fields),
    }
    for field in schema.system_fields:
        payload[_snake_case(field.field_name)] = _model_entry_field_value(model_key, field.source_key, record)
    return entry_type(**payload)


async def _list_model_entries(
    *,
    info: strawberry.Info[SiteGraphQLContext, None],
    model_key: str,
    perspective: Perspective,
    preview_token: str | None,
    filter_input: object | None,
    sort_input: object | None,
    locale: str | None,
    limit: int,
    offset: int,
) -> list[Any]:
    resolved = await _require_access(info, perspective=perspective, preview_token=preview_token)
    sort_field: str | None = None
    sort_direction = "asc"
    if sort_input is not None:
        typed_sort_input = cast(Any, sort_input)
        sort_field = typed_sort_input.field.value
        sort_direction = typed_sort_input.direction.value
    try:
        records = await info.context.graphql.list_records(
            runtime_id=info.context.runtime_id,
            model_key=model_key,
            perspective=resolved,
            environment_id=info.context.environment_id,
            exact_filters=_query_filter_payload(model_key, filter_input, "exact"),
            contains_filters=_query_filter_payload(model_key, filter_input, "contains"),
            sort_field=sort_field,
            sort_direction=sort_direction,
            locale=locale,
            limit=limit,
            offset=offset,
        )
    except APIError as exc:
        _raise_graphql_error(exc)
    return [_to_model_entry(model_key, record) for record in records]


async def _get_single_model_entry(
    *,
    info: strawberry.Info[SiteGraphQLContext, None],
    model_key: str,
    lookup_value: str,
    perspective: Perspective,
    preview_token: str | None,
    locale: str | None,
) -> Any | None:
    resolved = await _require_access(info, perspective=perspective, preview_token=preview_token)
    schema = _required_model_schema(model_key)
    try:
        if schema.single_query.resolver == "get_record_by_slug":
            record = await info.context.graphql.get_record_by_slug(
                runtime_id=info.context.runtime_id,
                model_key=model_key,
                slug=lookup_value,
                perspective=resolved,
                environment_id=info.context.environment_id,
                locale=locale,
            )
        elif schema.single_query.resolver == "get_page_record_by_path":
            record = await info.context.graphql.get_page_record_by_path(
                runtime_id=info.context.runtime_id,
                path=lookup_value,
                perspective=resolved,
                environment_id=info.context.environment_id,
                locale=locale,
            )
        elif schema.single_query.resolver == "get_reusable_section_record_by_alias":
            record = await info.context.graphql.get_reusable_section_record_by_alias(
                runtime_id=info.context.runtime_id,
                alias=lookup_value,
                perspective=resolved,
                environment_id=info.context.environment_id,
                locale=locale,
            )
        else:
            raise RuntimeError(f"GraphQL single query resolver is not registered: {schema.single_query.resolver}")
    except APIError as exc:
        _raise_graphql_error(exc)
    return _to_model_entry(model_key, record) if record is not None else None


def _configure_resolver_signature(
    resolver: Any,
    *,
    function_name: str,
    annotations: dict[str, object],
    signature: inspect.Signature,
) -> Any:
    resolver.__name__ = function_name
    resolver.__qualname__ = function_name
    resolver.__module__ = __name__
    resolver.__annotations__ = annotations
    resolver.__signature__ = signature
    return resolver


def _build_single_query_field(
    schema: GraphQLModelSchemaDefinition,
) -> Any:
    function_name = f"_resolve_{schema.model_key.replace('-', '_')}_single"
    argument_name = _assert_graphql_field_name(schema.single_query_argument, label="single query argument")
    entry_type = cast(Any, _MODEL_RUNTIME_TYPES[schema.model_key].entry_type)

    async def resolver(
        self: object,
        info: strawberry.Info[SiteGraphQLContext, None],
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
        locale: str | None = None,
        **kwargs: object,
    ) -> Any | None:
        lookup_value = kwargs.get(argument_name)
        if not isinstance(lookup_value, str):
            raise RuntimeError(f"GraphQL single query argument is missing: {argument_name}")
        return await _get_single_model_entry(
            info=info,
            model_key=schema.model_key,
            lookup_value=lookup_value,
            perspective=perspective,
            preview_token=preview_token,
            locale=locale,
        )

    resolver = _configure_resolver_signature(
        resolver,
        function_name=function_name,
        annotations={
            "info": strawberry.Info[SiteGraphQLContext, None],
            argument_name: str,
            "perspective": DeliveryPerspectiveEnum,
            "preview_token": str | None,
            "locale": str | None,
            "return": entry_type | None,
        },
        signature=inspect.Signature(
            parameters=[
                inspect.Parameter("self", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=object),
                inspect.Parameter(
                    "info",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    annotation=strawberry.Info[SiteGraphQLContext, None],
                ),
                inspect.Parameter(argument_name, inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=str),
                inspect.Parameter(
                    "perspective",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=Perspective.PUBLISHED,
                    annotation=DeliveryPerspectiveEnum,
                ),
                inspect.Parameter(
                    "preview_token",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=None,
                    annotation=str | None,
                ),
                inspect.Parameter(
                    "locale",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=None,
                    annotation=str | None,
                ),
            ],
            return_annotation=entry_type | None,
        ),
    )
    return strawberry.field(name=schema.single_query_name, resolver=resolver)


def _build_list_query_field(
    schema: GraphQLModelSchemaDefinition,
    *,
    filter_input_type: type[object],
    sort_input_type: type[object],
) -> Any:
    function_name = f"_resolve_{schema.model_key.replace('-', '_')}_list"
    entry_type = cast(Any, _MODEL_RUNTIME_TYPES[schema.model_key].entry_type)
    filter_type = cast(Any, filter_input_type)
    sort_type = cast(Any, sort_input_type)

    async def resolver(
        self: object,
        info: strawberry.Info[SiteGraphQLContext, None],
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
        filter: object | None = None,
        sort: object | None = None,
        locale: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Any]:
        return await _list_model_entries(
            info=info,
            model_key=schema.model_key,
            perspective=perspective,
            preview_token=preview_token,
            filter_input=filter,
            sort_input=sort,
            locale=locale,
            limit=limit,
            offset=offset,
        )

    resolver = _configure_resolver_signature(
        resolver,
        function_name=function_name,
        annotations={
            "info": strawberry.Info[SiteGraphQLContext, None],
            "perspective": DeliveryPerspectiveEnum,
            "preview_token": str | None,
            "filter": filter_type | None,
            "sort": sort_type | None,
            "locale": str | None,
            "limit": int,
            "offset": int,
            "return": list[entry_type],
        },
        signature=inspect.Signature(
            parameters=[
                inspect.Parameter("self", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=object),
                inspect.Parameter(
                    "info",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    annotation=strawberry.Info[SiteGraphQLContext, None],
                ),
                inspect.Parameter(
                    "perspective",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=Perspective.PUBLISHED,
                    annotation=DeliveryPerspectiveEnum,
                ),
                inspect.Parameter(
                    "preview_token",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=None,
                    annotation=str | None,
                ),
                inspect.Parameter(
                    "filter",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=None,
                    annotation=filter_type | None,
                ),
                inspect.Parameter(
                    "sort",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=None,
                    annotation=sort_type | None,
                ),
                inspect.Parameter(
                    "locale",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=None,
                    annotation=str | None,
                ),
                inspect.Parameter("limit", inspect.Parameter.POSITIONAL_OR_KEYWORD, default=20, annotation=int),
                inspect.Parameter("offset", inspect.Parameter.POSITIONAL_OR_KEYWORD, default=0, annotation=int),
            ],
            return_annotation=list[entry_type],
        ),
    )
    return strawberry.field(name=schema.list_query_name, resolver=resolver)


def _build_model_query_fields() -> dict[str, object]:
    fields: dict[str, object] = {}
    ordered_schemas = [
        _required_model_schema(model_key) for model_key in _QUERY_MODEL_ORDER if model_key in _SCHEMA_BY_MODEL_KEY
    ]
    ordered_schemas.extend(
        schema for schema in list_graphql_model_schemas() if schema.model_key not in set(_QUERY_MODEL_ORDER)
    )
    for schema in ordered_schemas:
        runtime_types = _MODEL_RUNTIME_TYPES[schema.model_key]
        prefix = schema.model_key.replace("-", "_")
        fields[f"{prefix}_single"] = _build_single_query_field(schema)
        fields[f"{prefix}_list"] = _build_list_query_field(
            schema,
            filter_input_type=runtime_types.filter_input_type,
            sort_input_type=runtime_types.sort_input_type,
        )
    return fields


class QueryBase:
    @strawberry.field
    async def resolve_page(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        path: str,
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
    ) -> GraphQLDeliveryPage | None:
        resolved = await _require_access(info, perspective=perspective, preview_token=preview_token)
        try:
            payload = await info.context.graphql.delivery_resolve_page(
                runtime_id=info.context.runtime_id,
                path=path,
                perspective=resolved,
            )
        except APIError as exc:
            _raise_graphql_error(exc)
        return _to_delivery_page(payload)

    @strawberry.field
    async def delivery_page_by_id(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        page_id: strawberry.ID,
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
    ) -> GraphQLDeliveryPage | None:
        resolved = await _require_access(info, perspective=perspective, preview_token=preview_token)
        try:
            payload = await info.context.graphql.delivery_get_page_by_id(
                runtime_id=info.context.runtime_id,
                page_id=UUID(str(page_id)),
                perspective=resolved,
            )
        except APIError as exc:
            _raise_graphql_error(exc)
        return _to_delivery_page(payload)

    @strawberry.field
    async def delivery_section_by_alias(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        alias: str,
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
    ) -> GraphQLDeliverySection:
        resolved = await _require_access(info, perspective=perspective, preview_token=preview_token)
        try:
            payload = await info.context.graphql.delivery_get_section_by_alias(
                runtime_id=info.context.runtime_id,
                alias=alias,
                perspective=resolved,
            )
        except APIError as exc:
            _raise_graphql_error(exc)
        return _to_delivery_section(payload)

    @strawberry.field
    async def delivery_global_set(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        key: str,
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
    ) -> GraphQLGlobalSet:
        resolved = await _require_access(info, perspective=perspective, preview_token=preview_token)
        try:
            payload = await info.context.graphql.delivery_get_global_set(
                runtime_id=info.context.runtime_id,
                key=key,
                perspective=resolved,
            )
        except APIError as exc:
            _raise_graphql_error(exc)
        return _to_global_set(payload)


def _base_query_fields() -> dict[str, object]:
    return {name: value for name, value in QueryBase.__dict__.items() if not name.startswith("__")}


Query = strawberry.type(
    type(
        "Query",
        (),
        {
            "__module__": __name__,
            **_base_query_fields(),
            **_build_model_query_fields(),
        },
    )
)


schema = strawberry.Schema(query=Query)


def get_graphql_schema_sdl() -> str:
    return schema.as_str()
