from __future__ import annotations

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.analytics.schema import AuditEventListQuery, AuditEventOut
from src.modules.analytics.service import ActivityService
from src.modules.auth.http.service import get_current_user, require_super_admin

router = APIRouter(
    tags=["domain.analytics"],
    dependencies=[Depends(require_super_admin)],
)


@router.get(
    "",
    response_model=ResponseModel[PageData[AuditEventOut]],
    summary="List activity events (system-scoped)",
)
async def list_activity(
    query: AuditEventListQuery = Depends(),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
    _super_admin=Depends(require_super_admin),
    _user=Depends(get_current_user),
) -> ResponseModel[PageData[AuditEventOut]]:
    """List activity events (system-scoped)."""
    service = ActivityService(settings)
    page = await service.list_events(organization_id=None, params=params, filters=query)
    return ApiResponse.success(data=page)


@router.get(
    "/{event_id}",
    response_model=ResponseModel[AuditEventOut],
    summary="Get activity event detail (system-scoped)",
)
async def get_activity_detail(
    event_id: PublicUUID,
    settings: Settings = Depends(get_settings),
    _super_admin=Depends(require_super_admin),
    _user=Depends(get_current_user),
) -> ResponseModel[AuditEventOut]:
    """Get activity event detail (system-scoped)."""
    service = ActivityService(settings)
    event = await service.get_event(organization_id=None, event_id=event_id)
    return ApiResponse.success(data=event)
