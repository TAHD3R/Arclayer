from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.src.common.constants.assets import ASSET_SCOPE_ORGANIZATION
from apps.api.src.common.protocols.tortoise import HasOrganizationId
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response as JsonResponse
from apps.api.src.core.http.response import ResponseModel
from apps.api.src.models.organization.org_membership import OrgMembership
from apps.api.src.modules.assets.admin.usages.schema import (
    AdminAssetUsageDeleteOut,
    AdminAssetUsageDeleteRequest,
    AdminAssetUsageOut,
    AdminAssetUsageUpsertRequest,
)
from apps.api.src.modules.assets.admin.usages.service import AdminAssetUsagesService
from apps.api.src.modules.assets.scope import AssetScope
from apps.api.src.modules.auth.http.service import get_current_user
from apps.api.src.modules.organization.http.service import (
    get_org_membership_for_organization,
    require_org_permission,
)

router = APIRouter(
    prefix="/organizations/{organization_id}",
    tags=["Organization: Asset Usages"],
    dependencies=[
        require_org_permission(
            "org.assets.read",
            error_code="ORG_ASSETS_READ_REQUIRED",
            membership_dependency=get_org_membership_for_organization,
        )
    ],
)


def get_admin_asset_usages_service(settings: Settings = Depends(get_settings)) -> AdminAssetUsagesService:
    return AdminAssetUsagesService(settings)


def _org_scope(orgm: OrgMembership) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_ORGANIZATION, id=UUID(str(cast(HasOrganizationId, orgm).organization_id)))


@router.get(
    "/assets/{asset_id}/usages",
    response_model=ResponseModel[PageData[AdminAssetUsageOut]],
    summary="List organization asset usages",
)
async def list_asset_usages(
    asset_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[PageData[AdminAssetUsageOut]]:
    page = await service.list_usages_by_asset(scope=_org_scope(orgm), asset_id=asset_id, params=params)
    return JsonResponse.success(data=page)


@router.put(
    "/asset-usages",
    response_model=ResponseModel[AdminAssetUsageOut],
    summary="Upsert organization asset usage",
    dependencies=[
        require_org_permission(
            "org.assets.manage",
            error_code="ORG_ASSETS_MANAGE_REQUIRED",
            membership_dependency=get_org_membership_for_organization,
        )
    ],
)
async def upsert_asset_usage(
    payload: AdminAssetUsageUpsertRequest,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageOut]:
    created = await service.upsert_usage(scope=_org_scope(orgm), actor_user_id=user.id, payload=payload)
    return JsonResponse.success(data=created)


@router.post(
    "/asset-usages/delete",
    response_model=ResponseModel[AdminAssetUsageDeleteOut],
    summary="Delete organization asset usage by ref",
    dependencies=[
        require_org_permission(
            "org.assets.manage",
            error_code="ORG_ASSETS_MANAGE_REQUIRED",
            membership_dependency=get_org_membership_for_organization,
        )
    ],
)
async def delete_asset_usage_by_ref(
    payload: AdminAssetUsageDeleteRequest,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageDeleteOut]:
    out = await service.delete_usage_by_ref(scope=_org_scope(orgm), payload=payload)
    return JsonResponse.success(data=out)


# Compatibility: some clients do not support DELETE bodies; keep a semantic-equivalent DELETE endpoint.
@router.delete(
    "/asset-usages",
    response_model=ResponseModel[AdminAssetUsageDeleteOut],
    summary="Delete organization asset usage by ref (compat)",
    dependencies=[
        require_org_permission(
            "org.assets.manage",
            error_code="ORG_ASSETS_MANAGE_REQUIRED",
            membership_dependency=get_org_membership_for_organization,
        )
    ],
)
async def delete_asset_usage_by_ref_delete(
    payload: AdminAssetUsageDeleteRequest,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageDeleteOut]:
    out = await service.delete_usage_by_ref(scope=_org_scope(orgm), payload=payload)
    return JsonResponse.success(data=out)
