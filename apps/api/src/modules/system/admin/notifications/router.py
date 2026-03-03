from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.system.admin.notifications.schema import (
    NotificationDeleteResult,
    NotificationDevSeedRequest,
    NotificationDevSeedResult,
    NotificationListQuery,
    NotificationOut,
    NotificationPreviewOut,
    NotificationReadAllResult,
    NotificationReadResult,
)
from apps.api.src.modules.system.admin.notifications.service import NotificationService
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/notifications",
    tags=["Workspace: Notifications"],
    dependencies=[require_workspace_permission("admin:access")],
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
    page = await service.list_notifications(
        workspace_id=ctx.workspace_id, user_id=user_id, params=params, filters=filters
    )
    return Response.success(data=page)


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
    preview = await service.get_unread_preview(workspace_id=ctx.workspace_id, user_id=user_id, limit=limit)
    return Response.success(data=preview)


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
    out = await service.mark_read(workspace_id=ctx.workspace_id, user_id=user_id, notification_id=notification_id)
    return Response.success(data=out)


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
    out = await service.mark_all_read(workspace_id=ctx.workspace_id, user_id=user_id)
    return Response.success(data=out)


@router.post(
    "/dev/seed",
    response_model=ResponseModel[NotificationDevSeedResult],
    summary="Seed demo notifications (dev/test only)",
)
async def seed_demo_notifications(
    payload: NotificationDevSeedRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationDevSeedResult]:
    out = await service.seed_demo_notifications(workspace_id=ctx.workspace_id, user_id=user_id, count=payload.count)
    return Response.success(data=out)


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
    out = await service.delete_notification(
        workspace_id=ctx.workspace_id, user_id=user_id, notification_id=notification_id
    )
    return Response.success(data=out)
