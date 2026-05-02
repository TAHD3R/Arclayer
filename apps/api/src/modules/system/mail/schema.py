from __future__ import annotations

from pydantic import EmailStr, Field

from src.common.schemas import BaseSchema


class MailTestRequest(BaseSchema):
    recipient: EmailStr = Field(..., description="Recipient email for test mail.")


class MailTestResult(BaseSchema):
    ok: bool = Field(..., description="Whether the test mail request is accepted.")
    provider: str | None = Field(default=None, description="Provider that accepted the test message.")


class MailProviderSwitchRequest(BaseSchema):
    provider: str = Field(..., description="Provider id to activate.")


class MailProviderInfo(BaseSchema):
    provider_id: str = Field(..., description="Provider id.")
    label: str = Field(..., description="Human-readable provider label.")
    active: bool = Field(..., description="Whether this provider is active.")
    configured: bool = Field(..., description="Whether required provider configuration is present.")
    available: bool = Field(..., description="Whether provider validation succeeds.")
    error: str | None = Field(default=None, description="Validation error when unavailable.")
