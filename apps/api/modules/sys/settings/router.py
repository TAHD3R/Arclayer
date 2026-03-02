from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.common.types.public_uuid import PublicUUID
from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from apps.api.core.http.response import Response, ResponseModel
from apps.api.modules.sys.deps import require_sys_super_admin
from apps.api.modules.sys.settings.schema import (
    SysConfigActivateRequest,
    SysConfigDetail,
    SysConfigNamespaceSummary,
    SysConfigPatch,
    SysConfigRevisionDetail,
    SysConfigRevisionOut,
    SysConfigTestRequest,
    SysConfigTestResult,
)
from apps.api.modules.sys.settings.service import SysConfigService

router = APIRouter(
    tags=["Sys: Settings"],
    dependencies=[Depends(require_sys_super_admin)],
)


def get_sys_config_service(settings: Settings = Depends(get_settings)) -> SysConfigService:
    return SysConfigService(settings)


@router.get(
    "",
    response_model=ResponseModel[PageData[SysConfigNamespaceSummary]],
    summary="List sys config namespaces (super admin)",
)
async def list_namespaces(
    service: SysConfigService = Depends(get_sys_config_service),
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SysConfigNamespaceSummary]]:
    items = await service.list_namespaces()
    page = paginate_items(items, params=params)
    return Response.success(data=page)


@router.get(
    "/{namespace}",
    response_model=ResponseModel[SysConfigDetail],
    summary="Get sys config namespace detail (super admin)",
)
async def get_namespace(
    namespace: str,
    service: SysConfigService = Depends(get_sys_config_service),
) -> ResponseModel[SysConfigDetail]:
    detail = await service.get_detail(namespace=namespace)
    return Response.success(data=detail)


@router.patch(
    "/{namespace}",
    response_model=ResponseModel[SysConfigDetail],
    summary="Patch sys config namespace (super admin)",
)
async def patch_namespace(
    namespace: str,
    payload: SysConfigPatch,
    service: SysConfigService = Depends(get_sys_config_service),
    user=Depends(require_sys_super_admin),
) -> ResponseModel[SysConfigDetail]:
    detail = await service.patch_namespace(
        namespace,
        patch=payload.patch,
        updated_by=getattr(user, "id", None),
        activate=bool(payload.activate),
    )
    return Response.success(data=detail)


@router.get(
    "/{namespace}/revisions",
    response_model=ResponseModel[PageData[SysConfigRevisionOut]],
    summary="List sys config revisions (super admin)",
)
async def list_revisions(
    namespace: str,
    service: SysConfigService = Depends(get_sys_config_service),
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SysConfigRevisionOut]]:
    page = await service.list_revisions_page(namespace=namespace, params=params)
    return Response.success(data=page)


@router.get(
    "/{namespace}/revisions/{revision_id}",
    response_model=ResponseModel[SysConfigRevisionDetail],
    summary="Get sys config revision detail (super admin)",
)
async def get_revision(
    namespace: str,
    revision_id: PublicUUID,
    service: SysConfigService = Depends(get_sys_config_service),
) -> ResponseModel[SysConfigRevisionDetail]:
    detail = await service.get_revision_detail(namespace=namespace, revision_id=revision_id)
    return Response.success(data=detail)


@router.post(
    "/{namespace}/test",
    response_model=ResponseModel[SysConfigTestResult],
    summary="Test a sys config revision (super admin)",
)
async def test_revision(
    namespace: str,
    payload: SysConfigTestRequest,
    service: SysConfigService = Depends(get_sys_config_service),
) -> ResponseModel[SysConfigTestResult]:
    out = await service.test_revision(namespace=namespace, revision_id=payload.revision_id)
    return Response.success(data=out)


@router.post(
    "/{namespace}/activate",
    response_model=ResponseModel[SysConfigDetail],
    summary="Activate a sys config revision (super admin)",
)
async def activate_revision(
    namespace: str,
    payload: SysConfigActivateRequest,
    service: SysConfigService = Depends(get_sys_config_service),
    user=Depends(require_sys_super_admin),
) -> ResponseModel[SysConfigDetail]:
    detail = await service.activate_revision(
        namespace=namespace,
        revision_id=payload.revision_id,
        activated_by=getattr(user, "id", None),
    )
    return Response.success(data=detail)
