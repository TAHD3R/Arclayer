from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.jobs.platform_schema import (
    PlatformJobDetailOut,
    PlatformJobListQuery,
    PlatformJobOut,
    PlatformJobQueuesOut,
)
from src.modules.jobs.platform_service import PlatformJobService
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode

router = APIRouter(tags=["internal.platform.jobs"])


def get_platform_job_service(settings: Settings = Depends(get_settings)) -> PlatformJobService:
    return PlatformJobService(settings)


@router.get(
    "/queues",
    response_model=ResponseModel[PlatformJobQueuesOut],
    response_model_exclude_none=True,
    summary="Get the background job queue overview per workload",
    dependencies=[require_platform_permission(PlatformPermissionCode.JOBS_READ)],
)
async def get_platform_job_queues(
    hours: int = Query(default=24, ge=1, le=168),
    service: PlatformJobService = Depends(get_platform_job_service),
) -> ResponseModel[PlatformJobQueuesOut]:
    """Read one DB-backed snapshot of backlog, in-flight work, and recent failures."""

    overview = await service.queue_overview(window_hours=hours)
    return ApiResponse.success(data=overview)


@router.get(
    "",
    response_model=ResponseModel[PageData[PlatformJobOut]],
    response_model_exclude_none=True,
    summary="List platform background jobs",
    dependencies=[require_platform_permission(PlatformPermissionCode.JOBS_READ)],
)
async def list_platform_jobs(
    filters: Annotated[PlatformJobListQuery, Depends()],
    params: Annotated[PageParams, Depends(get_page_params)],
    service: PlatformJobService = Depends(get_platform_job_service),
) -> ResponseModel[PageData[PlatformJobOut]]:
    """List recent durable jobs across every workload without visibility filtering."""

    page = await service.list_jobs(params=params, filters=filters)
    return ApiResponse.success(data=page)


@router.get(
    "/{job_id}",
    response_model=ResponseModel[PlatformJobDetailOut],
    response_model_exclude_none=True,
    summary="Get one platform background job with its attempts",
    dependencies=[require_platform_permission(PlatformPermissionCode.JOBS_READ)],
)
async def get_platform_job(
    job_id: PublicUUID,
    service: PlatformJobService = Depends(get_platform_job_service),
) -> ResponseModel[PlatformJobDetailOut]:
    """Read one Job projection plus its execution attempts and retry decisions."""

    detail = await service.get_job(job_id=job_id)
    return ApiResponse.success(data=detail)
