from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import MAX_OBSERVABILITY_RETENTION_DAYS, Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.observability.schema import ObservabilityOverviewOut, ObservabilityTrendMetric, ObservabilityTrendOut
from src.modules.observability.service import ObservabilityService
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_member_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/observability",
    tags=["domain.observability"],
)


@router.get(
    "/overview",
    response_model=ResponseModel[ObservabilityOverviewOut],
    summary="Get workspace observability overview",
)
async def get_workspace_observability_overview(
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    ctx: WorkspaceContext = Depends(require_workspace_member_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ObservabilityOverviewOut]:
    overview = await ObservabilityService(settings).overview(
        days=days,
        system_scope=False,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=overview)


@router.get(
    "/trends",
    response_model=ResponseModel[ObservabilityTrendOut],
    summary="Get workspace observability trend",
)
async def get_workspace_observability_trend(
    metric: ObservabilityTrendMetric = Query(default=ObservabilityTrendMetric.HTTP_REQUESTS),
    days: int = Query(default=30, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    ctx: WorkspaceContext = Depends(require_workspace_member_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ObservabilityTrendOut]:
    trend = await ObservabilityService(settings).trends(
        days=days,
        metric=metric,
        workspace_id=ctx.workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=trend)
