from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import MAX_OBSERVABILITY_RETENTION_DAYS, Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.observability.schema import (
    AIUsageGroupOut,
    AIUsageRecordOrdering,
    AIUsageRecordOut,
    HTTPRequestGroupOrdering,
    HTTPRequestGroupOut,
    HTTPRequestRecordOrdering,
    HTTPRequestRecordOut,
    ObservabilityOverviewOut,
    ObservabilityTrendMetric,
    ObservabilityTrendOut,
)
from src.modules.observability.service import ObservabilityService
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode

router = APIRouter(tags=["internal.system.observability"])


@router.get(
    "/overview",
    response_model=ResponseModel[ObservabilityOverviewOut],
    summary="Get platform AI and observability overview",
    dependencies=[require_platform_permission(PlatformPermissionCode.MONITORING_REQUESTS_READ)],
)
async def get_platform_observability_overview(
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ObservabilityOverviewOut]:
    overview = await ObservabilityService(settings).overview(
        days=days,
        start_date=start_date,
        end_date=end_date,
        system_scope=True,
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=overview)


@router.get(
    "/trends",
    response_model=ResponseModel[ObservabilityTrendOut],
    summary="Get platform observability trend",
    dependencies=[require_platform_permission(PlatformPermissionCode.MONITORING_REQUESTS_READ)],
)
async def get_platform_observability_trend(
    metric: ObservabilityTrendMetric = Query(default=ObservabilityTrendMetric.HTTP_REQUESTS),
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ObservabilityTrendOut]:
    trend = await ObservabilityService(settings).trends(
        days=days,
        start_date=start_date,
        end_date=end_date,
        metric=metric,
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=trend)


@router.get(
    "/request-groups",
    response_model=ResponseModel[PageData[HTTPRequestGroupOut]],
    summary="List aggregated platform HTTP request groups",
    dependencies=[require_platform_permission(PlatformPermissionCode.MONITORING_REQUESTS_READ)],
)
async def list_platform_http_request_groups(
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    q: str | None = Query(default=None, min_length=1, max_length=128),
    method: str | None = Query(default=None, min_length=1, max_length=8, pattern="^[A-Za-z]+$"),
    status_class: int | None = Query(default=None, alias="statusClass", ge=0, le=5),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    ordering: HTTPRequestGroupOrdering = Query(default=HTTPRequestGroupOrdering.REQUESTS_DESC),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[HTTPRequestGroupOut]]:
    page = await ObservabilityService(settings).list_http_request_groups(
        days=days,
        start_date=start_date,
        end_date=end_date,
        params=params,
        route_query=q,
        method=method,
        status_class=status_class,
        workspace_id=workspace_id,
        project_id=project_id,
        ordering=ordering,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/request-records",
    response_model=ResponseModel[PageData[HTTPRequestRecordOut]],
    summary="List completed platform HTTP requests",
    dependencies=[require_platform_permission(PlatformPermissionCode.MONITORING_REQUESTS_READ)],
)
async def list_platform_http_request_records(
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    q: str | None = Query(default=None, min_length=1, max_length=128),
    method: str | None = Query(default=None, min_length=1, max_length=8, pattern="^[A-Za-z]+$"),
    status_class: int | None = Query(default=None, alias="statusClass", ge=0, le=5),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    actor_user_id: PublicUUID | None = Query(default=None, alias="actorUserId"),
    min_duration_ms: int | None = Query(default=None, alias="minDurationMs", ge=0),
    max_duration_ms: int | None = Query(default=None, alias="maxDurationMs", ge=0),
    has_error: bool | None = Query(default=None, alias="hasError"),
    ordering: HTTPRequestRecordOrdering = Query(default=HTTPRequestRecordOrdering.OCCURRED_DESC),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[HTTPRequestRecordOut]]:
    page = await ObservabilityService(settings).list_http_request_records(
        days=days,
        start_date=start_date,
        end_date=end_date,
        params=params,
        query=q,
        method=method,
        status_class=status_class,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        min_duration_ms=min_duration_ms,
        max_duration_ms=max_duration_ms,
        has_error=has_error,
        ordering=ordering,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/ai-usage-groups",
    response_model=ResponseModel[PageData[AIUsageGroupOut]],
    summary="List aggregated platform AI usage groups",
    dependencies=[require_platform_permission(PlatformPermissionCode.MONITORING_REQUESTS_READ)],
)
async def list_platform_ai_usage_groups(
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    q: str | None = Query(default=None, min_length=1, max_length=128),
    provider: str | None = Query(default=None, min_length=1, max_length=50),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[AIUsageGroupOut]]:
    page = await ObservabilityService(settings).list_ai_usage_groups(
        days=days,
        start_date=start_date,
        end_date=end_date,
        params=params,
        query=q,
        provider=provider,
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/ai-usage-records",
    response_model=ResponseModel[PageData[AIUsageRecordOut]],
    summary="List task-level platform AI usage records",
    dependencies=[require_platform_permission(PlatformPermissionCode.MONITORING_REQUESTS_READ)],
)
async def list_platform_ai_usage_records(
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    start_date: date | None = Query(default=None, alias="startDate"),
    end_date: date | None = Query(default=None, alias="endDate"),
    q: str | None = Query(default=None, min_length=1, max_length=128),
    provider: str | None = Query(default=None, min_length=1, max_length=50),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    status: str | None = Query(default=None, min_length=1, max_length=32),
    source: str | None = Query(default=None, min_length=1, max_length=20),
    error_code: str | None = Query(default=None, alias="errorCode", min_length=1, max_length=50),
    ordering: AIUsageRecordOrdering = Query(default=AIUsageRecordOrdering.OCCURRED_DESC),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[AIUsageRecordOut]]:
    page = await ObservabilityService(settings).list_ai_usage_records(
        days=days,
        start_date=start_date,
        end_date=end_date,
        params=params,
        query=q,
        provider=provider,
        workspace_id=workspace_id,
        project_id=project_id,
        status=status,
        source=source,
        error_code=error_code,
        ordering=ordering,
    )
    return ApiResponse.success(data=page)
