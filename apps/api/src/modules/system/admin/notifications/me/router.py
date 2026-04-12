from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.system.admin.notifications.schema import (
    NotificationArchiveResult,
    NotificationDeleteResult,
    NotificationListQuery,
    NotificationOut,
    NotificationPreferencePatchIn,
    NotificationPreferencesOut,
    NotificationPreviewOut,
    NotificationReadAllResult,
    NotificationReadResult,
)
from src.modules.system.admin.notifications.service import NotificationService

router = APIRouter(
    prefix="/me/notifications",
    tags=["global.notifications"],
)


def get_notification_service(settings: Settings = Depends(get_settings)) -> NotificationService:
    return NotificationService(settings)


@router.get(
    "",
    response_model=ResponseModel[PageData[NotificationOut]],
    summary="List my notifications",
)
async def list_my_notifications(
    user_id: UUID = Depends(get_current_user_id),
    params: PageParams = Depends(get_page_params),
    filters: NotificationListQuery = Depends(),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[PageData[NotificationOut]]:
    """List my notifications."""
    page = await service.list_notifications_for_user(user_id=user_id, params=params, filters=filters)
    return ApiResponse.success(data=page)


@router.get(
    "/unread/preview",
    response_model=ResponseModel[NotificationPreviewOut],
    summary="Get my unread notification preview",
)
async def get_my_unread_preview(
    user_id: UUID = Depends(get_current_user_id),
    limit: int = Query(3, ge=1, le=20, description="Max unread items to return (default 3)."),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationPreviewOut]:
    """Get my unread notification preview."""
    preview = await service.get_unread_preview_for_user(user_id=user_id, limit=limit)
    return ApiResponse.success(data=preview)


@router.get(
    "/preferences",
    response_model=ResponseModel[NotificationPreferencesOut],
    summary="Get my notification delivery preferences",
)
async def get_my_notification_preferences(
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationPreferencesOut]:
    """Get my notification delivery preferences."""
    out = await service.get_notification_preferences_for_user(user_id=user_id)
    return ApiResponse.success(data=out)


@router.patch(
    "/preferences",
    response_model=ResponseModel[NotificationPreferencesOut],
    summary="Update one notification delivery preference",
)
async def patch_my_notification_preference(
    payload: NotificationPreferencePatchIn,
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationPreferencesOut]:
    """Update one notification delivery preference."""
    out = await service.patch_notification_preference_for_user(user_id=user_id, payload=payload)
    return ApiResponse.success(data=out)


@router.post(
    "/{notification_id}/read",
    response_model=ResponseModel[NotificationReadResult],
    summary="Mark my notification as read",
)
async def mark_my_notification_read(
    notification_id: PublicUUID,
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationReadResult]:
    """Mark my notification as read."""
    out = await service.mark_read_for_user(user_id=user_id, notification_id=notification_id)
    return ApiResponse.success(data=out)


@router.post(
    "/read-all",
    response_model=ResponseModel[NotificationReadAllResult],
    summary="Mark all my notifications as read",
)
async def mark_all_my_notifications_read(
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationReadAllResult]:
    """Mark all my notifications as read."""
    out = await service.mark_all_read_for_user(user_id=user_id)
    return ApiResponse.success(data=out)


@router.delete(
    "/{notification_id}",
    response_model=ResponseModel[NotificationDeleteResult],
    summary="Delete my notification",
)
async def delete_my_notification(
    notification_id: PublicUUID,
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationDeleteResult]:
    """Delete my notification."""
    out = await service.delete_notification_for_user(user_id=user_id, notification_id=notification_id)
    return ApiResponse.success(data=out)


@router.post(
    "/{notification_id}/archive",
    response_model=ResponseModel[NotificationArchiveResult],
    summary="Archive my notification",
)
async def archive_my_notification(
    notification_id: PublicUUID,
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationArchiveResult]:
    """Archive my notification."""
    out = await service.archive_notification_for_user(user_id=user_id, notification_id=notification_id)
    return ApiResponse.success(data=out)
