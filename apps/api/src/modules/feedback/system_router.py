from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import Unauthorized
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.feedback.feedback import (
    FeedbackCategory,
    FeedbackIntent,
    FeedbackPriority,
    FeedbackSource,
    FeedbackStatus,
)
from src.models.organization.user import User
from src.modules.feedback.schema import (
    FeedbackMessageCreate,
    FeedbackOrdering,
    FeedbackTicketDetailOut,
    FeedbackTicketListItemOut,
    FeedbackTicketUpdate,
)
from src.modules.feedback.service import FeedbackService
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal

router = APIRouter(tags=["internal.system.feedback"])


@router.get(
    "",
    response_model=ResponseModel[PageData[FeedbackTicketListItemOut]],
    summary="List platform product feedback",
    dependencies=[require_platform_permission(PlatformPermissionCode.MESSAGES_FEEDBACK_READ)],
)
async def list_platform_feedback(
    ticket_status: FeedbackStatus | None = Query(default=None, alias="status"),
    priority: FeedbackPriority | None = Query(default=None),
    source: FeedbackSource | None = Query(default=None),
    intent: FeedbackIntent | None = Query(default=None),
    legacy_category: FeedbackCategory | None = Query(default=None, alias="legacyCategory"),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId"),
    project_id: PublicUUID | None = Query(default=None, alias="projectId"),
    assignee_user_id: PublicUUID | None = Query(default=None, alias="assigneeUserId"),
    reporter_user_id: PublicUUID | None = Query(default=None, alias="reporterUserId"),
    created_from: datetime | None = Query(default=None, alias="createdFrom"),
    created_to: datetime | None = Query(default=None, alias="createdTo"),
    activity_from: datetime | None = Query(default=None, alias="activityFrom"),
    activity_to: datetime | None = Query(default=None, alias="activityTo"),
    ordering: FeedbackOrdering = Query(default=FeedbackOrdering.LAST_ACTIVITY_DESC),
    search: str | None = Query(default=None, min_length=1, max_length=200),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[FeedbackTicketListItemOut]]:
    page = await FeedbackService(settings).list_system(
        params=params,
        status=ticket_status,
        priority=priority,
        source=source,
        intent=intent,
        legacy_category=legacy_category,
        workspace_id=workspace_id,
        project_id=project_id,
        assignee_user_id=assignee_user_id,
        reporter_user_id=reporter_user_id,
        created_from=created_from,
        created_to=created_to,
        activity_from=activity_from,
        activity_to=activity_to,
        ordering=ordering,
        search=search,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/{ticket_id}",
    response_model=ResponseModel[FeedbackTicketDetailOut],
    summary="Get platform product feedback detail",
    dependencies=[require_platform_permission(PlatformPermissionCode.MESSAGES_FEEDBACK_READ)],
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
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.MESSAGES_FEEDBACK_MANAGE),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[FeedbackTicketDetailOut]:
    ticket = await FeedbackService(settings).update_ticket(
        ticket_id=ticket_id,
        payload=payload,
        actor_user_id=principal.actor_id,
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
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.MESSAGES_FEEDBACK_MANAGE),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[FeedbackTicketDetailOut]:
    actor = await User.get_or_none(id=principal.actor_id)
    if actor is None:
        raise Unauthorized(
            message=t("errors", "PLATFORM_ACTOR_NOT_FOUND"),
            error="PLATFORM_ACTOR_NOT_FOUND",
        )
    ticket = await FeedbackService(settings).add_message(ticket_id=ticket_id, payload=payload, author=actor)
    message = t(
        "platform",
        "API_FEEDBACK_REPLY_ADDED" if str(payload.kind) == "reply" else "API_FEEDBACK_NOTE_ADDED",
    )
    return ApiResponse.success(message=message, data=ticket)
