from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_site_delivery.schema import (
    PlatformDeliveryDomainOut,
    PlatformDeliveryDomainPage,
    PlatformDeliveryIssueListQuery,
    PlatformDeliveryIssueOut,
    PlatformDeliveryIssuePage,
    PlatformDeliveryRuleOut,
    PlatformDeliveryRulePage,
    PlatformDeliveryStorageOut,
    PlatformDeliveryStoragePage,
)
from src.modules.platform_site_delivery.service import PlatformSiteDeliveryService

router = APIRouter(tags=["platform.site-delivery"])


def get_platform_site_delivery_service() -> PlatformSiteDeliveryService:
    return PlatformSiteDeliveryService()


@router.get(
    "/issues",
    response_model=ResponseModel[PageData[PlatformDeliveryIssueOut]],
    response_model_exclude_none=True,
    summary="List delivery issues",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_READ)],
)
async def list_platform_delivery_issues(
    query: Annotated[PlatformDeliveryIssueListQuery, Depends()],
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryIssuePage]:
    return ApiResponse.success(data=await service.list_issues(params=params, query=query))


@router.get(
    "/domains",
    response_model=ResponseModel[PageData[PlatformDeliveryDomainOut]],
    response_model_exclude_none=True,
    summary="List domain and certificate readiness",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_READ)],
)
async def list_platform_delivery_domains(
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryDomainPage]:
    return ApiResponse.success(data=await service.list_domains(params=params))


@router.get(
    "/storage",
    response_model=ResponseModel[PageData[PlatformDeliveryStorageOut]],
    response_model_exclude_none=True,
    summary="List file storage readiness",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_STORAGE_READ)],
)
async def list_platform_delivery_storage(
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryStoragePage]:
    return ApiResponse.success(data=await service.list_storage(params=params))


@router.get(
    "/rules",
    response_model=ResponseModel[PageData[PlatformDeliveryRuleOut]],
    response_model_exclude_none=True,
    summary="List Hosting Continuity and delivery suspension rules",
    dependencies=[require_platform_permission(PlatformPermissionCode.SITE_DELIVERY_SETTINGS_READ)],
)
async def list_platform_delivery_rules(
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformSiteDeliveryService, Depends(get_platform_site_delivery_service)],
) -> ResponseModel[PlatformDeliveryRulePage]:
    return ApiResponse.success(data=await service.list_rules(params=params))
