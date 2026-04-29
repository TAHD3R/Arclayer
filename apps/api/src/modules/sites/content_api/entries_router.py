from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest, NotFound
from src.core.http.response import ApiResponse, ResponseModel
from src.models.projects.api_key import DeliveryKeyPerspective
from src.modules.auth.content_api.service import ContentApiAuthService
from src.modules.projects.runtime.router import get_runtime_context
from src.modules.projects.runtime.service import ProjectRuntimeContext
from src.modules.sites.content_api.rate_limit import enforce_content_api_rate_limit
from src.modules.sites.content_api.schema import ContentApiEntryListOut, ContentApiEntryOut
from src.modules.sites.delivery.schema import DeliveryPerspective
from src.modules.sites.graphql.service import SiteGraphQLService, StructuredContentRecord
from src.modules.sites.http.service import get_site_service
from src.modules.sites.service import SiteService
from src.modules.tenancy.database import TenantDatabaseRouter
from src.platform.cache.valkey import get_valkey

router = APIRouter(prefix="/runtimes/{runtime_id}/content", tags=["external.runtimes.content"])


def get_content_api_auth_service(settings: Settings = Depends(get_settings)) -> ContentApiAuthService:
    return ContentApiAuthService(settings)


def get_content_delivery_query_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteGraphQLService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteGraphQLService(settings, valkey=valkey)


async def authorize_content_entry_read(
    *,
    request: Request,
    runtime_context: ProjectRuntimeContext,
    perspective: DeliveryPerspective,
    preview_token: str | None,
    auth_service: ContentApiAuthService,
    site_service: SiteService,
) -> None:
    required_action = "project:delivery:read"
    if perspective == "published":
        await auth_service.authenticate_optional_delivery_key(
            request=request,
            site_id=runtime_context.site_id,
            required_action=required_action,
            delivery_perspective=DeliveryKeyPerspective.PUBLISHED,
        )
        return

    credential = await auth_service.authenticate_optional_delivery_key(
        request=request,
        site_id=runtime_context.site_id,
        required_action=required_action,
        delivery_perspective=DeliveryKeyPerspective.PREVIEW,
    )
    if credential is not None:
        return
    await site_service.assert_preview_access_async(
        site_id=runtime_context.site_id,
        mode="preview",
        token=preview_token,
    )


def _build_filter(field: str | None, value: str | None) -> dict[str, str]:
    if field is None and value is None:
        return {}
    if field is None or value is None:
        raise BadRequest("Filter field and value are both required", error="CONTENT_API_FILTER_PAIR_REQUIRED")
    normalized_field = field.strip()
    normalized_value = value.strip()
    if not normalized_field or not normalized_value:
        raise BadRequest("Filter field and value are both required", error="CONTENT_API_FILTER_PAIR_REQUIRED")
    return {normalized_field: normalized_value}


def _to_entry_out(record: StructuredContentRecord) -> ContentApiEntryOut:
    return ContentApiEntryOut(
        id=record.item_id,
        model_key=record.model_key,
        locale=record.locale,
        title=record.title,
        slug=record.slug,
        revision=record.revision,
        revision_state=record.revision_state,
        draft_revision=record.draft_revision,
        published_revision=record.published_revision,
        fields=record.fields,
        custom_fields=record.custom_fields,
        route_path=record.route_path,
        route_contract=record.route_contract,
    )


def _filter_locale(records: list[StructuredContentRecord], locale: str | None) -> list[StructuredContentRecord]:
    normalized = locale.strip() if isinstance(locale, str) else ""
    if not normalized:
        return records
    return [record for record in records if record.locale == normalized]


async def _list_records_in_tenant(
    *,
    runtime_context: ProjectRuntimeContext,
    query_service: SiteGraphQLService,
    model_key: str,
    perspective: DeliveryPerspective,
    exact_filters: dict[str, str] | None = None,
    contains_filters: dict[str, str] | None = None,
    sort_field: str | None = None,
    sort_direction: Literal["asc", "desc"] = "asc",
) -> list[StructuredContentRecord]:
    async with TenantDatabaseRouter(runtime_context.tenant_context).connection() as conn:
        return await query_service.with_database_connection(conn).list_records(
            runtime_id=runtime_context.runtime_id,
            model_key=model_key,
            perspective=perspective,
            exact_filters=exact_filters,
            contains_filters=contains_filters,
            sort_field=sort_field,
            sort_direction=sort_direction,
        )


@router.get(
    "/{model_key}",
    response_model=ResponseModel[ContentApiEntryListOut],
    response_model_exclude_none=True,
    summary="List content entries by model",
)
async def list_content_entries(
    request: Request,
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    _rate_limit: Annotated[None, Depends(enforce_content_api_rate_limit)],
    query_service: Annotated[SiteGraphQLService, Depends(get_content_delivery_query_service)],
    auth_service: Annotated[ContentApiAuthService, Depends(get_content_api_auth_service)],
    site_service: Annotated[SiteService, Depends(get_site_service)],
    model_key: Annotated[str, Path(..., min_length=1, description="Content model key.")],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    preview_token: Annotated[str | None, Query(alias="previewToken", description="Preview token.")] = None,
    locale: Annotated[str | None, Query(description="Locale filter, e.g. en-US.")] = None,
    exact_field: Annotated[str | None, Query(alias="filterField", description="Exact filter field.")] = None,
    exact_value: Annotated[str | None, Query(alias="filterValue", description="Exact filter value.")] = None,
    contains_field: Annotated[str | None, Query(alias="containsField", description="Contains filter field.")] = None,
    contains_value: Annotated[str | None, Query(alias="containsValue", description="Contains filter value.")] = None,
    sort_field: Annotated[str | None, Query(alias="sortField", description="Sort field.")] = None,
    sort_direction: Annotated[
        Literal["asc", "desc"], Query(alias="sortDirection", description="Sort direction.")
    ] = "asc",
    limit: Annotated[int, Query(ge=1, le=100, description="Page size.")] = 20,
    offset: Annotated[int, Query(ge=0, description="Page offset.")] = 0,
) -> ResponseModel[ContentApiEntryListOut]:
    """List content entries by model."""
    await authorize_content_entry_read(
        request=request,
        runtime_context=runtime_context,
        perspective=perspective,
        preview_token=preview_token,
        auth_service=auth_service,
        site_service=site_service,
    )
    records = await _list_records_in_tenant(
        runtime_context=runtime_context,
        query_service=query_service,
        model_key=model_key,
        perspective=perspective,
        exact_filters=_build_filter(exact_field, exact_value),
        contains_filters=_build_filter(contains_field, contains_value),
        sort_field=sort_field,
        sort_direction=sort_direction,
    )
    filtered = _filter_locale(records, locale)
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=ContentApiEntryListOut(
            model_key=model_key,
            perspective=perspective,
            locale=locale.strip() if isinstance(locale, str) and locale.strip() else None,
            total=len(filtered),
            limit=limit,
            offset=offset,
            items=[_to_entry_out(record) for record in filtered[offset : offset + limit]],
        )
    )


@router.get(
    "/{model_key}/{entry_id}",
    response_model=ResponseModel[ContentApiEntryOut],
    response_model_exclude_none=True,
    summary="Get a content entry by id",
)
async def get_content_entry(
    request: Request,
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    _rate_limit: Annotated[None, Depends(enforce_content_api_rate_limit)],
    query_service: Annotated[SiteGraphQLService, Depends(get_content_delivery_query_service)],
    auth_service: Annotated[ContentApiAuthService, Depends(get_content_api_auth_service)],
    site_service: Annotated[SiteService, Depends(get_site_service)],
    model_key: Annotated[str, Path(..., min_length=1, description="Content model key.")],
    entry_id: Annotated[PublicUUID, Path(..., description="Content entry id.")],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    preview_token: Annotated[str | None, Query(alias="previewToken", description="Preview token.")] = None,
    locale: Annotated[str | None, Query(description="Locale filter, e.g. en-US.")] = None,
) -> ResponseModel[ContentApiEntryOut]:
    """Get a content entry by id."""
    await authorize_content_entry_read(
        request=request,
        runtime_context=runtime_context,
        perspective=perspective,
        preview_token=preview_token,
        auth_service=auth_service,
        site_service=site_service,
    )
    records = _filter_locale(
        await _list_records_in_tenant(
            runtime_context=runtime_context,
            query_service=query_service,
            model_key=model_key,
            perspective=perspective,
        ),
        locale,
    )
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    for record in records:
        if record.item_id == entry_id:
            return ApiResponse.success(data=_to_entry_out(record))
    raise NotFound("Content entry not found", error="CONTENT_ENTRY_NOT_FOUND")
