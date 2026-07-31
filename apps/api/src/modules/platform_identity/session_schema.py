from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class PlatformSessionPrincipal(BaseSchema):
    """Authenticated Platform principal resolved from one device session."""

    model_config = ConfigDict(frozen=True, populate_by_name=True)

    actor_id: PublicUUID = Field(..., description="Platform session actor id.")
    session_id: PublicUUID = Field(..., description="Platform session id.")
    operator_id: PublicUUID | None = Field(default=None, description="Active Platform Operator id.")
    is_instance_owner: bool = Field(..., description="Whether the actor is the current Instance Owner.")
    policy_revision: int = Field(..., ge=1, description="Validated Platform Session policy revision.")
    absolute_expires_at: datetime = Field(..., description="Server-authoritative absolute expiry.")


class PlatformSessionCredential(BaseSchema):
    """Platform bearer credential issued after an independently completed MFA flow."""

    access_token: str = Field(..., min_length=1, description="Platform-only bearer token.")
    expires_in: int = Field(..., ge=1, description="Bearer token lifetime in seconds.")
    session: PlatformSessionPrincipal
