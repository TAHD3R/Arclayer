from __future__ import annotations

from fastapi import APIRouter, Depends

from src.core.http.response import ApiResponse, ResponseModel
from src.modules.platform_capabilities.schema import PlatformCapabilityCatalogOut
from src.modules.platform_capabilities.service import PlatformCapabilityCatalogService
from src.modules.platform_identity.http import (
    get_current_platform_session,
    get_platform_identity_repository,
)
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal

router = APIRouter(prefix="/capabilities", tags=["platform.capabilities"])


@router.get(
    "",
    response_model=ResponseModel[PlatformCapabilityCatalogOut],
    summary="List visible Platform capabilities",
)
async def list_platform_capabilities(
    principal: PlatformSessionPrincipal = Depends(get_current_platform_session),
    repository: PlatformIdentityRepository = Depends(get_platform_identity_repository),
) -> ResponseModel[PlatformCapabilityCatalogOut]:
    catalog = await PlatformCapabilityCatalogService(repository).list_catalog(principal)
    return ApiResponse.success(data=catalog)
