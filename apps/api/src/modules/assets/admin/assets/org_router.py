from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.constants.assets import ASSET_SCOPE_ORGANIZATION
from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import Response as JsonResponse
from src.core.http.response import ResponseModel
from src.models.organization.org_membership import OrgMembership
from src.modules.assets.admin.assets.schema import (
    AdminAssetDetailOut,
    AdminAssetFolderOut,
    AdminAssetListQuery,
    AdminAssetSummaryOut,
    AdminAssetTagCreateRequest,
    AdminAssetTagOut,
)
from src.modules.assets.admin.assets.service import AdminAssetsService
from src.modules.assets.scope import AssetScope
from src.modules.organization.http.service import (
    get_org_membership_for_organization,
    require_org_permission,
)

router = APIRouter(
    prefix="/organizations/{organization_id}",
    tags=["Organization: Asset Library"],
    dependencies=[
        require_org_permission(
            "org.assets.read",
            error_code="ORG_ASSETS_READ_REQUIRED",
            membership_dependency=get_org_membership_for_organization,
        )
    ],
)


def get_admin_assets_service(settings: Settings = Depends(get_settings)) -> AdminAssetsService:
    return AdminAssetsService(settings)


def _org_scope(orgm: OrgMembership) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_ORGANIZATION, id=UUID(str(cast(HasOrganizationId, orgm).organization_id)))


@router.get(
    "/assets",
    response_model=ResponseModel[PageData[AdminAssetSummaryOut]],
    summary="List organization assets",
)
async def list_assets(
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    params: PageParams = Depends(get_page_params),
    filters: AdminAssetListQuery = Depends(),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetSummaryOut]]:
    page = await service.list_assets(scope=_org_scope(orgm), params=params, filters=filters)
    return JsonResponse.success(data=page)


@router.get(
    "/asset-folders",
    response_model=ResponseModel[PageData[AdminAssetFolderOut]],
    summary="List organization asset folders",
)
async def list_asset_folders(
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    params: PageParams = Depends(get_page_params),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetFolderOut]]:
    page = await service.list_folders(scope=_org_scope(orgm), params=params)
    return JsonResponse.success(data=page)


@router.get(
    "/asset-tags",
    response_model=ResponseModel[PageData[AdminAssetTagOut]],
    summary="List organization asset tags",
)
async def list_asset_tags(
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    params: PageParams = Depends(get_page_params),
    q: str | None = None,
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetTagOut]]:
    page = await service.list_tags(scope=_org_scope(orgm), params=params, q=q)
    return JsonResponse.success(data=page)


@router.post(
    "/asset-tags",
    response_model=ResponseModel[AdminAssetTagOut],
    summary="Create organization asset tag",
    dependencies=[
        require_org_permission(
            "org.assets.manage",
            error_code="ORG_ASSETS_MANAGE_REQUIRED",
            membership_dependency=get_org_membership_for_organization,
        )
    ],
)
async def create_asset_tag(
    payload: AdminAssetTagCreateRequest,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetTagOut]:
    created = await service.create_tag(scope=_org_scope(orgm), payload=payload)
    return JsonResponse.success(data=created)


@router.get(
    "/assets/{asset_id}",
    response_model=ResponseModel[AdminAssetDetailOut],
    summary="Get organization asset detail",
)
async def get_asset_detail(
    asset_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDetailOut]:
    detail = await service.get_asset_detail(scope=_org_scope(orgm), asset_id=asset_id)
    return JsonResponse.success(data=detail)
