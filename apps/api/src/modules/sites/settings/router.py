from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.sites.http.service import get_site_service
from src.modules.sites.schema import SiteSettingGetOut, SiteSettingUpsertIn
from src.modules.sites.service import SiteService

router = APIRouter(tags=["external.sites.settings"])


@router.get(
    "/sites/{site_id}/settings",
    response_model=ResponseModel[SiteSettingGetOut],
    response_model_exclude_none=True,
    summary="Get a site setting (namespace-scoped)",
)
async def get_site_setting(
    site_id: PublicUUID,
    namespace: Annotated[str, Query(..., description="Setting namespace (e.g. site.runtime).")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteSettingGetOut]:
    """Get a site setting (namespace-scoped)."""
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.get_site_setting(site_id=site_id, namespace=namespace)
    return ApiResponse.success(data=data)


@router.put(
    "/sites/{site_id}/settings",
    response_model=ResponseModel[SiteSettingGetOut],
    response_model_exclude_none=True,
    summary="Upsert a site setting (namespace-scoped)",
)
async def upsert_site_setting(
    site_id: PublicUUID,
    namespace: Annotated[str, Query(..., description="Setting namespace (e.g. site.runtime).")],
    payload: Annotated[SiteSettingUpsertIn, Body(description="Upsert payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteSettingGetOut]:
    """Upsert a site setting (namespace-scoped)."""
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.upsert_site_setting(site_id=site_id, namespace=namespace, payload=payload)
    return ApiResponse.success(data=data)
