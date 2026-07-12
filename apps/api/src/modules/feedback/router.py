from __future__ import annotations

from fastapi import APIRouter, Depends, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.core.middleware.guard_decorators import (
    guard_bypass_penetration_detection,
    guard_rate_limit,
)
from src.models.organization.user import User
from src.modules.auth.http.service import get_current_user
from src.modules.feedback.schema import (
    FeedbackSubmitRequest,
    FeedbackTicketDetailOut,
    FeedbackTicketListItemOut,
)
from src.modules.feedback.service import FeedbackService

router = APIRouter(prefix="/feedback", tags=["domain.feedback"])

# Protect the support queue from automated submission bursts while allowing normal retry behavior.
FEEDBACK_SUBMIT_RATE_LIMIT = (12, 60)


@guard_bypass_penetration_detection()
@guard_rate_limit(*FEEDBACK_SUBMIT_RATE_LIMIT)
@router.post(
    "",
    response_model=ResponseModel[FeedbackTicketDetailOut],
    status_code=status.HTTP_201_CREATED,
    summary="Submit product feedback",
)
async def submit_feedback(
    payload: FeedbackSubmitRequest,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[FeedbackTicketDetailOut]:
    ticket = await FeedbackService(settings).submit(payload=payload, reporter=user)
    return ApiResponse.success(message=t("platform", "API_FEEDBACK_SUBMITTED"), data=ticket)


@router.get(
    "/mine",
    response_model=ResponseModel[PageData[FeedbackTicketListItemOut]],
    summary="List my product feedback",
)
async def list_my_feedback(
    user: User = Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[FeedbackTicketListItemOut]]:
    page = await FeedbackService(settings).list_mine(reporter_user_id=user.id, params=params)
    return ApiResponse.success(data=page)


@router.get(
    "/mine/{ticket_id}",
    response_model=ResponseModel[FeedbackTicketDetailOut],
    summary="Get my product feedback detail",
)
async def get_my_feedback_detail(
    ticket_id: PublicUUID,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[FeedbackTicketDetailOut]:
    ticket = await FeedbackService(settings).get_detail(
        ticket_id=ticket_id,
        include_internal_notes=False,
        reporter_user_id=user.id,
    )
    return ApiResponse.success(data=ticket)
