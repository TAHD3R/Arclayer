from __future__ import annotations

from datetime import datetime

from pydantic import Field

from apps.api.src.common.schemas import BaseSchema


class AuthSessionOut(BaseSchema):
    session_id: str = Field(..., min_length=1, max_length=64, description="Stable session id (sid claim).")
    issued_at: datetime = Field(..., description="Session issue time (UTC).")
    last_used_at: datetime | None = Field(default=None, description="Last refresh usage time (UTC).")
    current: bool = Field(default=False, description="Whether this is the current session.")
    ip_address: str | None = Field(default=None, description="IP address captured for this session.")
    user_agent: str | None = Field(default=None, description="Raw user agent captured for this session.")
    device_label: str | None = Field(default=None, description="Human-readable device label for this session.")
    location_label: str | None = Field(default=None, description="Human-readable location label for this session.")
    auth_method: str | None = Field(default=None, description="Authentication method used to establish the session.")
    revocable: bool = Field(default=True, description="Whether the session can be revoked from the current UI.")


class AuthSessionListOut(BaseSchema):
    items: list[AuthSessionOut] = Field(default_factory=list, description="Active sessions for current user.")
    total: int = Field(default=0, ge=0, description="Total active sessions.")


class AuthSessionRevokeOthersOut(BaseSchema):
    revoked_count: int = Field(default=0, ge=0, description="How many sessions were revoked.")
