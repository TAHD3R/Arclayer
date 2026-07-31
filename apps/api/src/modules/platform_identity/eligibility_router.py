from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.models.organization.user import User
from src.modules.auth.http.service import get_current_user
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.service import PlatformIdentityAuthorityService

router = APIRouter(
    prefix="/me/platform-entry-eligibility",
    tags=["domain.me.platform-entry-eligibility"],
)


class PlatformEntryEligibilityOut(BaseSchema):
    """Minimal Product projection used only to discover the Platform Console entry."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    eligible: bool


def get_platform_identity_authority_service() -> PlatformIdentityAuthorityService:
    return PlatformIdentityAuthorityService(repository=PlatformIdentityRepository())


@router.get(
    "",
    response_model=PlatformEntryEligibilityOut,
    operation_id="get_platform_entry_eligibility",
    summary="Check whether the current identity may attempt Platform Console entry",
)
async def get_platform_entry_eligibility(
    user: User = Depends(get_current_user),
    service: PlatformIdentityAuthorityService = Depends(get_platform_identity_authority_service),
) -> PlatformEntryEligibilityOut:
    eligibility = await service.entry_eligibility(user_id=user.id)
    return PlatformEntryEligibilityOut(eligible=eligibility.eligible)
