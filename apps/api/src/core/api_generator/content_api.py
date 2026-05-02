from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any, Literal, Protocol
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.core.exceptions import BadRequest, NotFound
from src.core.http.response import ApiResponse, ResponseModel

DeliveryPerspective = Literal["published", "preview"]
SortDirection = Literal["asc", "desc"]


@dataclass(frozen=True, slots=True)
class ContentApiRoutePolicy:
    route_class: Literal["content_delivery_read", "content_management"]
    auth_policy: Literal["public_or_delivery_key", "delivery_preview_or_preview_token"]
    read_action: str = "project:delivery:read"


@dataclass(frozen=True, slots=True)
class ContentApiVisibilityPolicy:
    response_shape: Literal["delivery_safe_entry"]
    honors_omit_from_api_response: bool = True


@dataclass(frozen=True, slots=True)
class ContentApiRouteDefinition:
    model_key: str
    list_path: str
    detail_path: str
    exact_filter_fields: frozenset[str]
    contains_filter_fields: frozenset[str]
    sort_fields: frozenset[str]
    route_policy: ContentApiRoutePolicy
    visibility_policy: ContentApiVisibilityPolicy
    extension_points: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ContentApiListQuery:
    perspective: DeliveryPerspective
    preview_token: str | None
    environment: str | None
    environment_id: UUID | None
    locale: str | None
    exact_filters: dict[str, str]
    contains_filters: dict[str, str]
    sort_field: str | None
    sort_direction: SortDirection
    limit: int
    offset: int


@dataclass(frozen=True, slots=True)
class ContentApiGeneratorDependencies:
    runtime_context: Callable[..., Any]
    rate_limit: Callable[..., Any]
    query_service: Callable[..., Any]
    auth_service: Callable[..., Any]
    site_service: Callable[..., Any]
    list_response_model: Any
    detail_response_model: Any


class ContentApiServiceBinding(Protocol):
    async def authorize_read(
        self,
        *,
        request: Request,
        runtime_context: Any,
        perspective: DeliveryPerspective,
        preview_token: str | None,
        auth_service: Any,
        site_service: Any,
    ) -> None: ...

    async def list_records(
        self,
        *,
        runtime_context: Any,
        query_service: Any,
        model_key: str,
        perspective: DeliveryPerspective,
        environment: str | None,
        environment_id: UUID | None,
        locale: str | None,
        exact_filters: dict[str, str],
        contains_filters: dict[str, str],
        sort_field: str | None,
        sort_direction: SortDirection,
    ) -> list[Any]: ...

    async def get_record(
        self,
        *,
        runtime_context: Any,
        query_service: Any,
        model_key: str,
        entry_id: UUID,
        perspective: DeliveryPerspective,
        environment: str | None,
        environment_id: UUID | None,
        locale: str | None,
    ) -> Any | None: ...

    def to_entry_response(self, record: Any) -> Any: ...

    def to_list_response(
        self,
        *,
        route: ContentApiRouteDefinition,
        query: ContentApiListQuery,
        total: int,
        items: list[Any],
    ) -> Any: ...


class ContentApiGeneratedController:
    def __init__(self, service_binding: ContentApiServiceBinding) -> None:
        self._service_binding = service_binding

    async def list_entries(
        self,
        *,
        request: Request,
        raw_response: FastAPIResponse,
        runtime_context: Any,
        query_service: Any,
        auth_service: Any,
        site_service: Any,
        route: ContentApiRouteDefinition,
        query: ContentApiListQuery,
    ) -> ResponseModel[Any]:
        await self._service_binding.authorize_read(
            request=request,
            runtime_context=runtime_context,
            perspective=query.perspective,
            preview_token=query.preview_token,
            auth_service=auth_service,
            site_service=site_service,
        )
        records = await self._service_binding.list_records(
            runtime_context=runtime_context,
            query_service=query_service,
            model_key=route.model_key,
            perspective=query.perspective,
            environment=query.environment,
            environment_id=query.environment_id,
            locale=query.locale,
            exact_filters=query.exact_filters,
            contains_filters=query.contains_filters,
            sort_field=query.sort_field,
            sort_direction=query.sort_direction,
        )
        raw_response.headers["cache-control"] = _cache_control_for(query.perspective)
        return ApiResponse.success(
            data=self._service_binding.to_list_response(
                route=route,
                query=query,
                total=len(records),
                items=[
                    self._service_binding.to_entry_response(record)
                    for record in records[query.offset : query.offset + query.limit]
                ],
            )
        )

    async def get_entry(
        self,
        *,
        request: Request,
        raw_response: FastAPIResponse,
        runtime_context: Any,
        query_service: Any,
        auth_service: Any,
        site_service: Any,
        route: ContentApiRouteDefinition,
        entry_id: PublicUUID,
        perspective: DeliveryPerspective,
        preview_token: str | None,
        environment: str | None,
        environment_id: UUID | None,
        locale: str | None,
    ) -> ResponseModel[Any]:
        await self._service_binding.authorize_read(
            request=request,
            runtime_context=runtime_context,
            perspective=perspective,
            preview_token=preview_token,
            auth_service=auth_service,
            site_service=site_service,
        )
        record = await self._service_binding.get_record(
            runtime_context=runtime_context,
            query_service=query_service,
            model_key=route.model_key,
            entry_id=entry_id,
            perspective=perspective,
            environment=environment,
            environment_id=environment_id,
            locale=locale,
        )
        raw_response.headers["cache-control"] = _cache_control_for(perspective)
        if record is not None:
            return ApiResponse.success(data=self._service_binding.to_entry_response(record))
        raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")


def create_generated_content_api_router(
    *,
    routes: tuple[ContentApiRouteDefinition, ...],
    controller: ContentApiGeneratedController,
    dependencies: ContentApiGeneratorDependencies,
) -> APIRouter:
    router = APIRouter(prefix="/runtimes/{runtime_id}/content", tags=["external.runtimes.content"])
    for route in routes:
        _register_generated_route(router=router, route=route, controller=controller, dependencies=dependencies)
    return router


def build_filter_pair(*, field: str | None, value: str | None, allowed_fields: frozenset[str]) -> dict[str, str]:
    if field is None and value is None:
        return {}
    if field is None or value is None:
        raise BadRequest("Filter field and value are both required", error="CONTENT_API_FILTER_PAIR_REQUIRED")
    normalized_field = field.strip()
    normalized_value = value.strip()
    if not normalized_field or not normalized_value:
        raise BadRequest("Filter field and value are both required", error="CONTENT_API_FILTER_PAIR_REQUIRED")
    if normalized_field not in allowed_fields:
        raise BadRequest(
            "Content API filter field is not allowed for this model",
            error="CONTENT_API_FILTER_FIELD_FORBIDDEN",
            meta={"field": normalized_field, "allowedFields": sorted(allowed_fields)},
        )
    return {normalized_field: normalized_value}


def normalize_optional_text(value: str | None) -> str | None:
    normalized = value.strip() if isinstance(value, str) else ""
    return normalized or None


def filter_records_by_locale(records: list[Any], locale: str | None) -> list[Any]:
    """Deprecated compatibility helper; locale filtering belongs in service bindings."""
    normalized = normalize_optional_text(locale)
    if normalized is None:
        return records
    return [record for record in records if getattr(record, "locale", None) == normalized]


def _cache_control_for(perspective: DeliveryPerspective) -> str:
    if perspective == "preview":
        return "no-store"
    return "public, max-age=60, stale-while-revalidate=300"


def _register_generated_route(
    *,
    router: APIRouter,
    route: ContentApiRouteDefinition,
    controller: ContentApiGeneratedController,
    dependencies: ContentApiGeneratorDependencies,
) -> None:
    async def list_endpoint(
        request: Request,
        raw_response: FastAPIResponse,
        runtime_context: Any = Depends(dependencies.runtime_context),
        _rate_limit: None = Depends(dependencies.rate_limit),
        query_service: Any = Depends(dependencies.query_service),
        auth_service: Any = Depends(dependencies.auth_service),
        site_service: Any = Depends(dependencies.site_service),
        perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
        preview_token: Annotated[str | None, Query(alias="previewToken", description="Preview token.")] = None,
        environment: Annotated[str | None, Query(description="Environment key, id, or alias.")] = None,
        environment_id: Annotated[
            PublicUUID | None, Query(alias="environmentId", description="Environment id.")
        ] = None,
        locale: Annotated[str | None, Query(description="Locale filter, e.g. en-US.")] = None,
        exact_field: Annotated[str | None, Query(alias="filterField", description="Exact filter field.")] = None,
        exact_value: Annotated[str | None, Query(alias="filterValue", description="Exact filter value.")] = None,
        contains_field: Annotated[
            str | None, Query(alias="containsField", description="Contains filter field.")
        ] = None,
        contains_value: Annotated[
            str | None, Query(alias="containsValue", description="Contains filter value.")
        ] = None,
        sort_field: Annotated[str | None, Query(alias="sortField", description="Sort field.")] = None,
        sort_direction: Annotated[SortDirection, Query(alias="sortDirection", description="Sort direction.")] = "asc",
        limit: Annotated[int, Query(ge=1, le=100, description="Page size.")] = 20,
        offset: Annotated[int, Query(ge=0, description="Page offset.")] = 0,
    ) -> ResponseModel[Any]:
        """List generated content entries."""
        normalized_sort_field = sort_field.strip() if isinstance(sort_field, str) and sort_field.strip() else None
        if normalized_sort_field is not None and normalized_sort_field not in route.sort_fields:
            raise BadRequest(
                "Content API sort field is not allowed for this model",
                error="CONTENT_API_SORT_FIELD_FORBIDDEN",
                meta={"field": normalized_sort_field, "allowedFields": sorted(route.sort_fields)},
            )
        return await controller.list_entries(
            request=request,
            raw_response=raw_response,
            runtime_context=runtime_context,
            query_service=query_service,
            auth_service=auth_service,
            site_service=site_service,
            route=route,
            query=ContentApiListQuery(
                perspective=perspective,
                preview_token=preview_token,
                environment=normalize_optional_text(environment),
                environment_id=environment_id,
                locale=normalize_optional_text(locale),
                exact_filters=build_filter_pair(
                    field=exact_field,
                    value=exact_value,
                    allowed_fields=route.exact_filter_fields,
                ),
                contains_filters=build_filter_pair(
                    field=contains_field,
                    value=contains_value,
                    allowed_fields=route.contains_filter_fields,
                ),
                sort_field=normalized_sort_field,
                sort_direction=sort_direction,
                limit=limit,
                offset=offset,
            ),
        )

    async def detail_endpoint(
        request: Request,
        raw_response: FastAPIResponse,
        entry_id: Annotated[PublicUUID, Path(..., description="Content entry id.")],
        runtime_context: Any = Depends(dependencies.runtime_context),
        _rate_limit: None = Depends(dependencies.rate_limit),
        query_service: Any = Depends(dependencies.query_service),
        auth_service: Any = Depends(dependencies.auth_service),
        site_service: Any = Depends(dependencies.site_service),
        perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
        preview_token: Annotated[str | None, Query(alias="previewToken", description="Preview token.")] = None,
        environment: Annotated[str | None, Query(description="Environment key, id, or alias.")] = None,
        environment_id: Annotated[
            PublicUUID | None, Query(alias="environmentId", description="Environment id.")
        ] = None,
        locale: Annotated[str | None, Query(description="Locale filter, e.g. en-US.")] = None,
    ) -> ResponseModel[Any]:
        """Get a generated content entry by id."""
        return await controller.get_entry(
            request=request,
            raw_response=raw_response,
            runtime_context=runtime_context,
            query_service=query_service,
            auth_service=auth_service,
            site_service=site_service,
            route=route,
            entry_id=entry_id,
            perspective=perspective,
            preview_token=preview_token,
            environment=normalize_optional_text(environment),
            environment_id=environment_id,
            locale=normalize_optional_text(locale),
        )

    operation_prefix = route.model_key.replace("-", "_")
    router.add_api_route(
        route.list_path,
        list_endpoint,
        methods=["GET"],
        name=f"list_{operation_prefix}_content_entries",
        response_model=dependencies.list_response_model,
        response_model_exclude_none=True,
        summary=f"List {route.model_key} content entries",
    )
    router.add_api_route(
        route.detail_path,
        detail_endpoint,
        methods=["GET"],
        name=f"get_{operation_prefix}_content_entry",
        response_model=dependencies.detail_response_model,
        response_model_exclude_none=True,
        summary=f"Get {route.model_key} content entry by id",
    )
