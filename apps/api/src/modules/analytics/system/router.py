from __future__ import annotations

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.analytics.schema import AuditEventListQuery, AuditEventOut
from src.modules.analytics.service import ActivityService
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode

router = APIRouter(tags=["domain.analytics"])


@router.get(
    "",
    response_model=ResponseModel[PageData[AuditEventOut]],
    summary="List activity events (system-scoped)",
    dependencies=[require_platform_permission(PlatformPermissionCode.MONITORING_AUDIT_READ)],
)
async def list_activity(
    query: AuditEventListQuery = Depends(),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[AuditEventOut]]:
    """List activity events (system-scoped)."""
    service = ActivityService(settings)
    page = await service.list_events(organization_id=None, params=params, filters=query)
    return ApiResponse.success(data=page)


@router.get(
    "/{event_id}",
    response_model=ResponseModel[AuditEventOut],
    summary="Get activity event detail (system-scoped)",
    dependencies=[require_platform_permission(PlatformPermissionCode.MONITORING_AUDIT_READ)],
)
async def get_activity_detail(
    event_id: PublicUUID,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AuditEventOut]:
    """Get activity event detail (system-scoped)."""
    service = ActivityService(settings)
    event = await service.get_event(organization_id=None, event_id=event_id)
    return ApiResponse.success(data=event)
