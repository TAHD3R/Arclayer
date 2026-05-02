from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.jobs.schema import PublishJobListQuery, PublishJobOut
from src.modules.system.jobs.service import SystemJobsService

router = APIRouter(
    tags=["internal.system.jobs"],
    dependencies=[Depends(require_super_admin)],
)


def get_system_jobs_service() -> SystemJobsService:
    return SystemJobsService()


@router.get(
    "",
    response_model=ResponseModel[PageData[PublishJobOut]],
    response_model_exclude_none=True,
    summary="List platform jobs",
)
async def list_system_jobs(
    query: Annotated[PublishJobListQuery, Depends()],
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[SystemJobsService, Depends(get_system_jobs_service)],
    _user=Depends(get_current_user),
) -> ResponseModel[PageData[PublishJobOut]]:
    page = await service.list_jobs(params=params, filters=query)
    return ApiResponse.success(data=page)


@router.post(
    "/{job_id}/retry",
    response_model=ResponseModel[PublishJobOut],
    response_model_exclude_none=True,
    summary="Retry a failed publish job",
)
async def retry_system_job(
    job_id: PublicUUID,
    service: Annotated[SystemJobsService, Depends(get_system_jobs_service)],
    _user=Depends(get_current_user),
) -> ResponseModel[PublishJobOut]:
    out = await service.retry_job(job_id=job_id)
    return ApiResponse.success(data=out)
