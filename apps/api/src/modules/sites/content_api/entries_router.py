from __future__ import annotations

from typing import Any, Literal

from fastapi import Depends, Request

from src.config import Settings, get_settings
from src.core.api_generator import (
    ContentApiGeneratedController,
    ContentApiGeneratorDependencies,
    ContentApiRouteDefinition,
    ContentApiRoutePolicy,
    ContentApiVisibilityPolicy,
    create_generated_content_api_router,
)
from src.core.http.response import ResponseModel
from src.models.projects.api_key import DeliveryKeyPerspective
from src.modules.auth.content_api.service import ContentApiAuthService
from src.modules.projects.runtime.router import get_runtime_context
from src.modules.projects.runtime.service import ProjectRuntimeContext
from src.modules.sites.content_api.rate_limit import enforce_content_api_rate_limit
from src.modules.sites.content_api.schema import ContentApiEntryListOut, ContentApiEntryOut
from src.modules.sites.delivery.schema import DeliveryPerspective
from src.modules.sites.graphql.planner import list_graphql_query_rules
from src.modules.sites.graphql.service import SiteGraphQLService, StructuredContentRecord
from src.modules.sites.http.service import get_site_service
from src.modules.sites.service import SiteService
from src.modules.tenancy.database import TenantDatabaseRouter
from src.platform.cache.valkey import get_valkey


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


class ContentDeliveryServiceBinding:
    async def authorize_read(
        self,
        *,
        request: Request,
        runtime_context: ProjectRuntimeContext,
        perspective: DeliveryPerspective,
        preview_token: str | None,
        auth_service: ContentApiAuthService,
        site_service: SiteService,
    ) -> None:
        await authorize_content_entry_read(
            request=request,
            runtime_context=runtime_context,
            perspective=perspective,
            preview_token=preview_token,
            auth_service=auth_service,
            site_service=site_service,
        )

    async def list_records(
        self,
        *,
        runtime_context: ProjectRuntimeContext,
        query_service: SiteGraphQLService,
        model_key: str,
        perspective: DeliveryPerspective,
        exact_filters: dict[str, str],
        contains_filters: dict[str, str],
        sort_field: str | None,
        sort_direction: Literal["asc", "desc"],
    ) -> list[StructuredContentRecord]:
        return await _list_records_in_tenant(
            runtime_context=runtime_context,
            query_service=query_service,
            model_key=model_key,
            perspective=perspective,
            exact_filters=exact_filters,
            contains_filters=contains_filters,
            sort_field=sort_field,
            sort_direction=sort_direction,
        )

    def to_entry_response(self, record: StructuredContentRecord) -> ContentApiEntryOut:
        return _to_entry_out(record)

    def to_list_response(
        self,
        *,
        route: ContentApiRouteDefinition,
        query: Any,
        total: int,
        items: list[ContentApiEntryOut],
    ) -> ContentApiEntryListOut:
        return ContentApiEntryListOut(
            model_key=route.model_key,
            perspective=query.perspective,
            locale=query.locale,
            total=total,
            limit=query.limit,
            offset=query.offset,
            items=items,
        )


def list_generated_content_api_routes() -> tuple[ContentApiRouteDefinition, ...]:
    return tuple(
        ContentApiRouteDefinition(
            model_key=model_key,
            list_path=f"/{model_key}",
            detail_path=f"/{model_key}/{{entry_id}}",
            exact_filter_fields=rule.exact_filter_fields,
            contains_filter_fields=rule.contains_filter_fields,
            sort_fields=rule.sort_fields,
            route_policy=ContentApiRoutePolicy(
                route_class="content_delivery_read",
                auth_policy="public_or_delivery_key",
            ),
            visibility_policy=ContentApiVisibilityPolicy(response_shape="delivery_safe_entry"),
            extension_points=(
                "content-api-auth-policy",
                "content-api-visibility-policy",
                "content-api-query-policy",
                "content-api-response-shaper",
            ),
        )
        for model_key, rule in sorted(list_graphql_query_rules().items())
    )


router = create_generated_content_api_router(
    routes=list_generated_content_api_routes(),
    controller=ContentApiGeneratedController(ContentDeliveryServiceBinding()),
    dependencies=ContentApiGeneratorDependencies(
        runtime_context=get_runtime_context,
        rate_limit=enforce_content_api_rate_limit,
        query_service=get_content_delivery_query_service,
        auth_service=get_content_api_auth_service,
        site_service=get_site_service,
        list_response_model=ResponseModel[ContentApiEntryListOut],
        detail_response_model=ResponseModel[ContentApiEntryOut],
    ),
)
