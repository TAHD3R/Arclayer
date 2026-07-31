from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from src.common.schemas.base import BaseSchema
from src.common.types.json_types import JsonObject
from src.models.platform_identity.operations import PlatformVerificationAssurance


class PlatformStepUpProofIssueRequest(BaseSchema):
    """Reviewed action context that one fresh Platform verification may bind."""

    actor_user_id: UUID
    session_id: UUID
    action_code: str = Field(min_length=1, max_length=128)
    target_type: str = Field(min_length=1, max_length=64)
    target_id: UUID | None = None
    scope: JsonObject
    expected_revision: int | None = Field(default=None, ge=0)
    preview_revision: int | None = Field(default=None, ge=0)
    idempotency_key: str = Field(min_length=1, max_length=128)


class PlatformStepUpProofIssueResult(BaseSchema):
    """The opaque proof is intentionally returned only at issue time."""

    proof_id: UUID
    proof: str
    assurance: PlatformVerificationAssurance
    policy_revision: int
    expires_at: datetime


class PlatformStepUpProofConsumeRequest(PlatformStepUpProofIssueRequest):
    """Final apply context; all reviewed fields must equal the issued proof."""

    proof: str = Field(min_length=1)


class PlatformStepUpConsumeResult(BaseSchema):
    """Receipt for an accepted proof consumption, not an action result."""

    proof_id: UUID
    accepted: bool = True
