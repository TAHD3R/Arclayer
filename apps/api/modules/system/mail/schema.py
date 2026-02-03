from __future__ import annotations

from pydantic import EmailStr, Field

from apps.api.common.schemas import BaseSchema


class MailTestRequest(BaseSchema):
    recipient: EmailStr = Field(..., description="Recipient email for test mail.")


class MailTestResult(BaseSchema):
    ok: bool = Field(..., description="Whether the test mail request is accepted.")
