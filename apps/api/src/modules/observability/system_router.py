from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import MAX_OBSERVABILITY_RETENTION_DAYS, Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import require_super_admin
from src.modules.observability.schema import (
    AIUsageGroupOut,
    HTTPRequestGroupOut,
    ObservabilityOverviewOut,
    ObservabilityTrendMetric,
    ObservabilityTrendOut,
)
from src.modules.observability.service import ObservabilityService

router = APIRouter(
    tags=["internal.system.observability"],
    dependencies=[Depends(require_super_admin)],
)


@router.get(
    "/overview",
    response_model=ResponseModel[ObservabilityOverviewOut],
    summary="Get platform observability overview",
)
async def get_platform_observability_overview(
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ObservabilityOverviewOut]:
    overview = await ObservabilityService(settings).overview(
        days=days,
        system_scope=True,
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=overview)


@router.get(
    "/trends",
    response_model=ResponseModel[ObservabilityTrendOut],
    summary="Get platform observability trend",
)
async def get_platform_observability_trend(
    metric: ObservabilityTrendMetric = Query(default=ObservabilityTrendMetric.HTTP_REQUESTS),
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ObservabilityTrendOut]:
    trend = await ObservabilityService(settings).trends(
        days=days,
        metric=metric,
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=trend)


@router.get(
    "/request-groups",
    response_model=ResponseModel[PageData[HTTPRequestGroupOut]],
    summary="List aggregated platform HTTP request groups",
)
async def list_platform_http_request_groups(
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    q: str | None = Query(default=None, min_length=1, max_length=128),
    method: str | None = Query(default=None, min_length=1, max_length=8, pattern="^[A-Za-z]+$"),
    status_class: int | None = Query(default=None, alias="statusClass", ge=0, le=5),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[HTTPRequestGroupOut]]:
    page = await ObservabilityService(settings).list_http_request_groups(
        days=days,
        params=params,
        route_query=q,
        method=method,
        status_class=status_class,
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/ai-usage-groups",
    response_model=ResponseModel[PageData[AIUsageGroupOut]],
    summary="List aggregated platform AI usage groups",
)
async def list_platform_ai_usage_groups(
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    q: str | None = Query(default=None, min_length=1, max_length=128),
    provider: str | None = Query(default=None, min_length=1, max_length=50),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[AIUsageGroupOut]]:
    page = await ObservabilityService(settings).list_ai_usage_groups(
        days=days,
        params=params,
        query=q,
        provider=provider,
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=page)
