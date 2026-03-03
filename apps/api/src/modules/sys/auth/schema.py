from __future__ import annotations

from pydantic import Field, SecretStr

from apps.api.src.common.schemas import BaseSchema


class SysStepUpRequest(BaseSchema):
    password: SecretStr = Field(..., min_length=1, description="Current user password for step-up.")


class SysStepUpResult(BaseSchema):
    token: str = Field(..., min_length=1, description="Short-lived sys governance access token.")
    expires_in: int = Field(..., ge=1, description="Token TTL (seconds).")
