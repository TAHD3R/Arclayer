from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.system.admin.notifications.schema import (
    NotificationDeleteResult,
    NotificationDevSeedRequest,
    NotificationDevSeedResult,
    NotificationListQuery,
    NotificationOut,
    NotificationPreviewOut,
    NotificationReadAllResult,
    NotificationReadResult,
)
from src.modules.system.admin.notifications.service import NotificationService
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/notifications",
    tags=["domain.workspaces.notifications"],
    dependencies=[require_workspace_permission("system:notifications:read")],
)


def get_notification_service(settings: Settings = Depends(get_settings)) -> NotificationService:
    return NotificationService(settings)


@router.get(
    "",
    response_model=ResponseModel[PageData[NotificationOut]],
    summary="List notifications",
)
async def list_notifications(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    params: PageParams = Depends(get_page_params),
    filters: NotificationListQuery = Depends(),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[PageData[NotificationOut]]:
    """List notifications."""
    page = await service.list_notifications(
        workspace_id=ctx.workspace_id, user_id=user_id, params=params, filters=filters
    )
    return ApiResponse.success(data=page)


@router.get(
    "/unread/preview",
    response_model=ResponseModel[NotificationPreviewOut],
    summary="Get unread notification preview",
)
async def get_unread_preview(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    limit: int = Query(3, ge=1, le=20, description="Max unread items to return (default 3)."),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationPreviewOut]:
    """Get unread notification preview."""
    preview = await service.get_unread_preview(workspace_id=ctx.workspace_id, user_id=user_id, limit=limit)
    return ApiResponse.success(data=preview)


@router.post(
    "/{notification_id}/read",
    response_model=ResponseModel[NotificationReadResult],
    summary="Mark a notification as read",
)
async def mark_read(
    notification_id: PublicUUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationReadResult]:
    """Mark a notification as read."""
    out = await service.mark_read(workspace_id=ctx.workspace_id, user_id=user_id, notification_id=notification_id)
    return ApiResponse.success(data=out)


@router.post(
    "/read-all",
    response_model=ResponseModel[NotificationReadAllResult],
    summary="Mark all notifications as read",
)
async def mark_all_read(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationReadAllResult]:
    """Mark all notifications as read."""
    out = await service.mark_all_read(workspace_id=ctx.workspace_id, user_id=user_id)
    return ApiResponse.success(data=out)


@router.post(
    "/dev/seed",
    response_model=ResponseModel[NotificationDevSeedResult],
    summary="Seed demo notifications (dev/test only)",
    dependencies=[require_workspace_permission("system:notifications:manage")],
)
async def seed_demo_notifications(
    payload: NotificationDevSeedRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationDevSeedResult]:
    """Seed demo notifications (dev/test only)."""
    out = await service.seed_demo_notifications(workspace_id=ctx.workspace_id, user_id=user_id, count=payload.count)
    return ApiResponse.success(data=out)


@router.delete(
    "/{notification_id}",
    response_model=ResponseModel[NotificationDeleteResult],
    summary="Delete a notification",
)
async def delete_notification(
    notification_id: PublicUUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationDeleteResult]:
    """Delete a notification."""
    out = await service.delete_notification(
        workspace_id=ctx.workspace_id, user_id=user_id, notification_id=notification_id
    )
    return ApiResponse.success(data=out)
