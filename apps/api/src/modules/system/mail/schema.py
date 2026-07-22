from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import EmailStr, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject


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
    last_test_status: Literal["passed", "failed"] | None = Field(
        default=None,
        description="Last provider send-test status.",
    )
    last_test_message: str | None = Field(default=None, description="Last provider send-test message.")
    last_tested_at: datetime | None = Field(default=None, description="Last provider send-test timestamp.")


class MailTemplateCreateRequest(BaseSchema):
    key: str = Field(..., pattern=r"^[a-z][a-z0-9_]{1,95}$")
    locale: str = Field(..., pattern=r"^[a-z]{2}(?:-[A-Z]{2})?$")
    name: str = Field(..., min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    subject_template: str = Field(..., min_length=1, max_length=500)
    html_template: str = Field(..., min_length=1, max_length=200_000)
    text_template: str = Field(..., min_length=1, max_length=50_000)
    variables: list[str] = Field(default_factory=list, max_length=64)
    is_enabled: bool = True

    @field_validator("variables")
    @classmethod
    def validate_variables(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            key = value.strip()
            if not key.isidentifier() or key.startswith("_"):
                raise ValueError("MAIL_TEMPLATE_VARIABLE_INVALID")
            if key not in normalized:
                normalized.append(key)
        return normalized


class MailTemplatePatchRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    subject_template: str | None = Field(default=None, min_length=1, max_length=500)
    html_template: str | None = Field(default=None, min_length=1, max_length=200_000)
    text_template: str | None = Field(default=None, min_length=1, max_length=50_000)
    variables: list[str] | None = Field(default=None, max_length=64)
    is_enabled: bool | None = None

    @field_validator("variables")
    @classmethod
    def validate_variables(cls, values: list[str] | None) -> list[str] | None:
        return None if values is None else MailTemplateCreateRequest.validate_variables(values)


class MailTemplateOut(BaseSchema):
    id: UUID
    key: str
    locale: str
    name: str
    description: str | None
    subject_template: str
    html_template: str
    text_template: str
    variables: list[str]
    is_enabled: bool
    version: int
    created_at: datetime
    updated_at: datetime


class MailTemplatePreviewRequest(BaseSchema):
    subject_template: str = Field(..., min_length=1, max_length=500)
    html_template: str = Field(..., min_length=1, max_length=200_000)
    text_template: str = Field(..., min_length=1, max_length=50_000)
    variables: JsonObject = Field(default_factory=dict)


class MailTemplatePreviewOut(BaseSchema):
    subject: str
    html: str
    text: str
