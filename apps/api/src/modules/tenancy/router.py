from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.organization.http.service import require_org_admin
from src.modules.tenancy.schema import TenantIdentityOut
from src.modules.tenancy.service import TenancyService

router = APIRouter(tags=["internal.tenancy"], dependencies=[Depends(require_org_admin)])


def get_tenancy_service(settings: Settings = Depends(get_settings)) -> TenancyService:
    return TenancyService(settings)


@router.get(
    "/workspaces/{workspace_id}",
    response_model=ResponseModel[TenantIdentityOut],
    summary="Read workspace tenancy identity",
)
async def get_workspace_tenant(
    workspace_id: UUID,
    service: Annotated[TenancyService, Depends(get_tenancy_service)],
) -> ResponseModel[TenantIdentityOut]:
    """Read tenant isolation metadata for a workspace."""
    data = await service.get_workspace_tenant(workspace_id=workspace_id)
    return ApiResponse.success(data=data)
