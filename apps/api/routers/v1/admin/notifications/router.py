from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.config import Settings, get_settings
from apps.api.core.authz import require_permission_strict
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.organization.deps import get_current_org_id
from apps.api.routers.v1.admin.notifications.schema import (
    NotificationListQuery,
    NotificationOut,
    NotificationPreviewOut,
    NotificationReadAllResult,
    NotificationReadResult,
)
from apps.api.routers.v1.admin.notifications.service import NotificationService
from apps.api.routers.v1.auth.deps import get_current_user_id

router = APIRouter(tags=["Services: Notifications"])


def get_notification_service(settings: Settings = Depends(get_settings)) -> NotificationService:
    return NotificationService(settings)


@router.get(
    "",
    response_model=ResponseModel[PageData[NotificationOut]],
    dependencies=[require_permission_strict("admin:access")],
    summary="List notifications",
)
async def list_notifications(
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    params: PageParams = Depends(get_page_params),
    filters: NotificationListQuery = Depends(),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[PageData[NotificationOut]]:
    page = await service.list_notifications(org_id=org_id, user_id=user_id, params=params, filters=filters)
    return Response.success(data=page)


@router.get(
    "/unread/preview",
    response_model=ResponseModel[NotificationPreviewOut],
    dependencies=[require_permission_strict("admin:access")],
    summary="Get unread notification preview",
)
async def get_unread_preview(
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    limit: int = Query(3, ge=1, le=20, description="Max unread items to return (default 3)."),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationPreviewOut]:
    preview = await service.get_unread_preview(org_id=org_id, user_id=user_id, limit=limit)
    return Response.success(data=preview)


@router.post(
    "/{notification_id}/read",
    response_model=ResponseModel[NotificationReadResult],
    dependencies=[require_permission_strict("admin:access")],
    summary="Mark a notification as read",
)
async def mark_read(
    notification_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationReadResult]:
    out = await service.mark_read(org_id=org_id, user_id=user_id, notification_id=notification_id)
    return Response.success(data=out)


@router.post(
    "/read-all",
    response_model=ResponseModel[NotificationReadAllResult],
    dependencies=[require_permission_strict("admin:access")],
    summary="Mark all notifications as read",
)
async def mark_all_read(
    org_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationReadAllResult]:
    out = await service.mark_all_read(org_id=org_id, user_id=user_id)
    return Response.success(data=out)
