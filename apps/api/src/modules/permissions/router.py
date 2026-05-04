from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.organization.http.service import require_org_admin
from src.modules.permissions.schema import PermissionConditionTemplateOut
from src.modules.permissions.service import PermissionsService

router = APIRouter(tags=["internal.permissions"], dependencies=[Depends(require_org_admin)])


def get_permissions_service(settings: Settings = Depends(get_settings)) -> PermissionsService:
    return PermissionsService(settings)


@router.get(
    "/condition-templates",
    response_model=ResponseModel[list[PermissionConditionTemplateOut]],
    summary="List permission condition templates",
)
async def list_condition_templates(
    service: PermissionsService = Depends(get_permissions_service),
) -> ResponseModel[list[PermissionConditionTemplateOut]]:
    """List supported conditional permission templates."""
    data = await service.list_condition_templates()
    return ApiResponse.success(data=data)
