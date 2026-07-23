from __future__ import annotations

import re
from datetime import datetime

from pydantic import Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.system.access_restriction import (
    AccessRestrictionEntityType,
    AccessRestrictionReasonCategory,
    AccessRestrictionState,
    AccessRestrictionType,
)

_REASON_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{2,63}$")


class AccessRestrictionEnforceRequest(BaseSchema):
    expected_revision: int = Field(ge=0, description="Current restriction revision; zero creates it.")
    reason_category: AccessRestrictionReasonCategory = Field(..., description="Stable reason category.")
    reason_code: str = Field(min_length=3, max_length=64, description="Stable operator-defined reason code.")
    operator_note: str = Field(min_length=1, max_length=2000, description="Internal operator note.")
    review_at: datetime | None = Field(default=None, description="Optional scheduled review time.")
    expires_at: datetime | None = Field(default=None, description="Optional policy expiry time.")

    @field_validator("reason_code")
    @classmethod
    def validate_reason_code(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not _REASON_CODE_PATTERN.fullmatch(normalized):
            raise ValueError("reasonCode must be a stable lower_snake_case code")
        return normalized

    @field_validator("operator_note")
    @classmethod
    def normalize_operator_note(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("operatorNote is required")
        return normalized

    @model_validator(mode="after")
    def validate_review_window(self) -> AccessRestrictionEnforceRequest:
        if self.review_at is not None and self.expires_at is not None and self.review_at > self.expires_at:
            raise ValueError("reviewAt must not be later than expiresAt")
        return self


class AccessRestrictionLiftRequest(BaseSchema):
    expected_revision: int = Field(ge=1, description="Current active restriction revision.")
    operator_note: str = Field(min_length=1, max_length=2000, description="Internal recovery note.")

    @field_validator("operator_note")
    @classmethod
    def normalize_operator_note(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("operatorNote is required")
        return normalized


class AccessRestrictionOut(BaseSchema):
    restriction_id: PublicUUID
    entity_type: AccessRestrictionEntityType
    entity_id: PublicUUID
    restriction_type: AccessRestrictionType
    state: AccessRestrictionState
    reason_category: AccessRestrictionReasonCategory
    reason_code: str
    effective_at: datetime
    review_at: datetime | None
    expires_at: datetime | None
    revision: int
    support_available: bool = True
    allowed_recovery_actions: list[str] = Field(default_factory=list)


class AccessRestrictionAdminOut(AccessRestrictionOut):
    operator_note: str
    actor_user_id: PublicUUID | None
    lifted_at: datetime | None
    lifted_by_user_id: PublicUUID | None
    lift_note: str | None
    audit_event_id: PublicUUID | None


def recovery_actions_for(restriction_type: AccessRestrictionType | str) -> list[str]:
    resolved = AccessRestrictionType(restriction_type)
    if resolved == AccessRestrictionType.USER_DISABLED:
        return ["contact_support", "sign_out"]
    if resolved == AccessRestrictionType.WORKSPACE_ARCHIVED:
        return ["restore_workspace", "switch_workspace", "contact_support"]
    if resolved == AccessRestrictionType.WORKSPACE_SUSPENDED:
        return ["switch_workspace", "contact_support"]
    return ["switch_project", "contact_support"]
