from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.feedback.feedback import FeedbackCategory, FeedbackPriority, FeedbackSource, FeedbackStatus
from src.models.organization.user import User
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.feedback.schema import (
    FeedbackMessageCreate,
    FeedbackTicketDetailOut,
    FeedbackTicketListItemOut,
    FeedbackTicketUpdate,
)
from src.modules.feedback.service import FeedbackService

router = APIRouter(
    tags=["internal.system.feedback"],
    dependencies=[Depends(require_super_admin)],
)


@router.get(
    "",
    response_model=ResponseModel[PageData[FeedbackTicketListItemOut]],
    summary="List platform product feedback",
)
async def list_platform_feedback(
    ticket_status: FeedbackStatus | None = Query(default=None, alias="status"),
    priority: FeedbackPriority | None = Query(default=None),
    source: FeedbackSource | None = Query(default=None),
    category: FeedbackCategory | None = Query(default=None),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    assignee_user_id: PublicUUID | None = Query(default=None, alias="assigneeUserId"),
    search: str | None = Query(default=None, min_length=1, max_length=200),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[FeedbackTicketListItemOut]]:
    page = await FeedbackService(settings).list_system(
        params=params,
        status=ticket_status,
        priority=priority,
        source=source,
        category=category,
        workspace_id=workspace_id,
        assignee_user_id=assignee_user_id,
        search=search,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/{ticket_id}",
    response_model=ResponseModel[FeedbackTicketDetailOut],
    summary="Get platform product feedback detail",
)
async def get_platform_feedback_detail(
    ticket_id: PublicUUID,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[FeedbackTicketDetailOut]:
    ticket = await FeedbackService(settings).get_detail(ticket_id=ticket_id, include_internal_notes=True)
    return ApiResponse.success(data=ticket)


@router.patch(
    "/{ticket_id}",
    response_model=ResponseModel[FeedbackTicketDetailOut],
    summary="Update platform product feedback",
)
async def update_platform_feedback(
    ticket_id: PublicUUID,
    payload: FeedbackTicketUpdate,
    actor: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[FeedbackTicketDetailOut]:
    ticket = await FeedbackService(settings).update_ticket(
        ticket_id=ticket_id,
        payload=payload,
        actor_user_id=actor.id,
    )
    return ApiResponse.success(message=t("platform", "API_FEEDBACK_UPDATED"), data=ticket)


@router.post(
    "/{ticket_id}/messages",
    response_model=ResponseModel[FeedbackTicketDetailOut],
    summary="Add a reply or internal note to product feedback",
)
async def add_platform_feedback_message(
    ticket_id: PublicUUID,
    payload: FeedbackMessageCreate,
    actor: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[FeedbackTicketDetailOut]:
    ticket = await FeedbackService(settings).add_message(ticket_id=ticket_id, payload=payload, author=actor)
    message = t(
        "platform",
        "API_FEEDBACK_REPLY_ADDED" if str(payload.kind) == "reply" else "API_FEEDBACK_NOTE_ADDED",
    )
    return ApiResponse.success(message=message, data=ticket)
