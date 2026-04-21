from __future__ import annotations

import enum
from typing import Any, cast
from uuid import UUID

import strawberry
from graphql import GraphQLError
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
    graphql_error_extensions,
)

_SCHEMA_BY_MODEL_KEY: dict[str, GraphQLModelSchemaDefinition] = {
    schema.model_key: schema for schema in list_graphql_model_schemas()
}


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


@strawberry.type
class ArticleEntry:
    id: str
    locale: str
    revision: int
    revision_state: str
    draft_revision: int
    published_revision: int | None
    title: str | None
    slug: str | None
    summary: str | None
    content: str | None
    published_at: str | None
    custom_fields: JSON


@strawberry.type
class PageEntry:
    id: str
    locale: str
    revision: int
    revision_state: str
    draft_revision: int
    published_revision: int | None
    title: str | None
    path: str | None
    route_pattern: str | None
    custom_fields: JSON


@strawberry.type
class ReusableSectionEntry:
    id: str
    locale: str
    revision: int
    revision_state: str
    draft_revision: int
    published_revision: int | None
    title: str | None
    section_key: str | None
    props_defaults: JSON | None
    custom_fields: JSON


@strawberry.type
class CategoryEntry:
    id: str
    locale: str
    revision: int
    revision_state: str
    draft_revision: int
    published_revision: int | None
    name: str | None
    slug: str | None
    description: str | None
    custom_fields: JSON


@strawberry.enum
class GraphQLSortDirection(enum.Enum):
    ASC = "asc"
    DESC = "desc"


@strawberry.enum
class ArticleSortField(enum.Enum):
    TITLE = "title"
    SLUG = "slug"
    REVISION = "revision"


@strawberry.enum
class PageSortField(enum.Enum):
    TITLE = "title"
    PATH = "path"
    REVISION = "revision"


@strawberry.enum
class ReusableSectionSortField(enum.Enum):
    TITLE = "title"
    SECTION_KEY = "section_key"
    REVISION = "revision"


@strawberry.enum
class CategorySortField(enum.Enum):
    NAME = "name"
    SLUG = "slug"
    REVISION = "revision"


@strawberry.input
class ArticleFilterInput:
    slug: str | None = None
    title_contains: str | None = None
    revision_state: str | None = None


@strawberry.input
class PageFilterInput:
    path: str | None = None
    title_contains: str | None = None
    revision_state: str | None = None


@strawberry.input
class ReusableSectionFilterInput:
    section_key: str | None = None
    title_contains: str | None = None
    revision_state: str | None = None


@strawberry.input
class CategoryFilterInput:
    slug: str | None = None
    name_contains: str | None = None
    revision_state: str | None = None


@strawberry.input
class ArticleSortInput:
    field: ArticleSortField
    direction: GraphQLSortDirection = GraphQLSortDirection.ASC


@strawberry.input
class PageSortInput:
    field: PageSortField
    direction: GraphQLSortDirection = GraphQLSortDirection.ASC


@strawberry.input
class ReusableSectionSortInput:
    field: ReusableSectionSortField
    direction: GraphQLSortDirection = GraphQLSortDirection.ASC


@strawberry.input
class CategorySortInput:
    field: CategorySortField
    direction: GraphQLSortDirection = GraphQLSortDirection.ASC


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


def _snake_case(value: str) -> str:
    chars: list[str] = []
    for index, char in enumerate(value):
        if char.isupper() and index > 0:
            chars.append("_")
        chars.append(char.lower())
    return "".join(chars)


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
            site_id=info.context.site_id,
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


def _to_article_entry(record: StructuredContentRecord) -> ArticleEntry:
    return ArticleEntry(
        id=str(record.item_id),
        locale=record.locale,
        revision=record.revision,
        revision_state=record.revision_state,
        draft_revision=record.draft_revision,
        published_revision=record.published_revision,
        title=record.title,
        slug=record.slug,
        summary=record.fields.get("summary"),
        content=record.fields.get("content"),
        published_at=record.fields.get("published_at"),
        custom_fields=_as_json(record.custom_fields),
    )


def _to_page_entry(record: StructuredContentRecord) -> PageEntry:
    route_pattern = (
        record.route_path if record.route_contract and record.route_contract.get("mode") == "dynamic" else None
    )
    return PageEntry(
        id=str(record.item_id),
        locale=record.locale,
        revision=record.revision,
        revision_state=record.revision_state,
        draft_revision=record.draft_revision,
        published_revision=record.published_revision,
        title=record.title,
        path=record.route_path or record.fields.get("path"),
        route_pattern=route_pattern or record.fields.get("route_pattern"),
        custom_fields=_as_json(record.custom_fields),
    )


def _to_reusable_section_entry(record: StructuredContentRecord) -> ReusableSectionEntry:
    return ReusableSectionEntry(
        id=str(record.item_id),
        locale=record.locale,
        revision=record.revision,
        revision_state=record.revision_state,
        draft_revision=record.draft_revision,
        published_revision=record.published_revision,
        title=record.title,
        section_key=record.fields.get("section_key"),
        props_defaults=_as_optional_json(cast(dict[str, Any] | None, record.fields.get("props_defaults"))),
        custom_fields=_as_json(record.custom_fields),
    )


def _to_category_entry(record: StructuredContentRecord) -> CategoryEntry:
    return CategoryEntry(
        id=str(record.item_id),
        locale=record.locale,
        revision=record.revision,
        revision_state=record.revision_state,
        draft_revision=record.draft_revision,
        published_revision=record.published_revision,
        name=record.fields.get("name"),
        slug=record.slug,
        description=record.fields.get("description"),
        custom_fields=_as_json(record.custom_fields),
    )


_ENTRY_BUILDERS = {
    "article": _to_article_entry,
    "category": _to_category_entry,
    "page": _to_page_entry,
    "reusable-section": _to_reusable_section_entry,
}


def _to_model_entry(model_key: str, record: StructuredContentRecord) -> Any:
    return _ENTRY_BUILDERS[model_key](record)


async def _list_model_entries(
    *,
    info: strawberry.Info[SiteGraphQLContext, None],
    model_key: str,
    perspective: Perspective,
    preview_token: str | None,
    filter_input: object | None,
    sort_input: object | None,
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
            site_id=info.context.site_id,
            model_key=model_key,
            perspective=resolved,
            exact_filters=_query_filter_payload(model_key, filter_input, "exact"),
            contains_filters=_query_filter_payload(model_key, filter_input, "contains"),
            sort_field=sort_field,
            sort_direction=sort_direction,
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
) -> Any | None:
    resolved = await _require_access(info, perspective=perspective, preview_token=preview_token)
    schema = _required_model_schema(model_key)
    try:
        if schema.single_query.resolver == "get_record_by_slug":
            record = await info.context.graphql.get_record_by_slug(
                site_id=info.context.site_id,
                model_key=model_key,
                slug=lookup_value,
                perspective=resolved,
            )
        elif schema.single_query.resolver == "get_page_record_by_path":
            record = await info.context.graphql.get_page_record_by_path(
                site_id=info.context.site_id,
                path=lookup_value,
                perspective=resolved,
            )
        elif schema.single_query.resolver == "get_reusable_section_record_by_alias":
            record = await info.context.graphql.get_reusable_section_record_by_alias(
                site_id=info.context.site_id,
                alias=lookup_value,
                perspective=resolved,
            )
        else:
            raise RuntimeError(f"GraphQL single query resolver is not registered: {schema.single_query.resolver}")
    except APIError as exc:
        _raise_graphql_error(exc)
    return _to_model_entry(model_key, record) if record is not None else None


@strawberry.type
class Query:
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
                site_id=info.context.site_id,
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
                site_id=info.context.site_id,
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
                site_id=info.context.site_id,
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
                site_id=info.context.site_id,
                key=key,
                perspective=resolved,
            )
        except APIError as exc:
            _raise_graphql_error(exc)
        return _to_global_set(payload)

    @strawberry.field
    async def article_by_slug(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        slug: str,
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
    ) -> ArticleEntry | None:
        return await _get_single_model_entry(
            info=info,
            model_key="article",
            lookup_value=slug,
            perspective=perspective,
            preview_token=preview_token,
        )

    @strawberry.field
    async def articles(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
        filter: ArticleFilterInput | None = None,
        sort: ArticleSortInput | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[ArticleEntry]:
        return await _list_model_entries(
            info=info,
            model_key="article",
            perspective=perspective,
            preview_token=preview_token,
            filter_input=filter,
            sort_input=sort,
            limit=limit,
            offset=offset,
        )

    @strawberry.field
    async def page_entry_by_path(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        path: str,
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
    ) -> PageEntry | None:
        return await _get_single_model_entry(
            info=info,
            model_key="page",
            lookup_value=path,
            perspective=perspective,
            preview_token=preview_token,
        )

    @strawberry.field
    async def pages(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
        filter: PageFilterInput | None = None,
        sort: PageSortInput | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[PageEntry]:
        return await _list_model_entries(
            info=info,
            model_key="page",
            perspective=perspective,
            preview_token=preview_token,
            filter_input=filter,
            sort_input=sort,
            limit=limit,
            offset=offset,
        )

    @strawberry.field
    async def reusable_section_by_alias(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        alias: str,
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
    ) -> ReusableSectionEntry | None:
        return await _get_single_model_entry(
            info=info,
            model_key="reusable-section",
            lookup_value=alias,
            perspective=perspective,
            preview_token=preview_token,
        )

    @strawberry.field
    async def reusable_sections(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
        filter: ReusableSectionFilterInput | None = None,
        sort: ReusableSectionSortInput | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[ReusableSectionEntry]:
        return await _list_model_entries(
            info=info,
            model_key="reusable-section",
            perspective=perspective,
            preview_token=preview_token,
            filter_input=filter,
            sort_input=sort,
            limit=limit,
            offset=offset,
        )

    @strawberry.field
    async def category_by_slug(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        slug: str,
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
    ) -> CategoryEntry | None:
        return await _get_single_model_entry(
            info=info,
            model_key="category",
            lookup_value=slug,
            perspective=perspective,
            preview_token=preview_token,
        )

    @strawberry.field
    async def categories(
        self,
        info: strawberry.Info[SiteGraphQLContext, None],
        perspective: DeliveryPerspectiveEnum = Perspective.PUBLISHED,
        preview_token: str | None = None,
        filter: CategoryFilterInput | None = None,
        sort: CategorySortInput | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[CategoryEntry]:
        return await _list_model_entries(
            info=info,
            model_key="category",
            perspective=perspective,
            preview_token=preview_token,
            filter_input=filter,
            sort_input=sort,
            limit=limit,
            offset=offset,
        )


schema = strawberry.Schema(query=Query)


def get_graphql_schema_sdl() -> str:
    return schema.as_str()
