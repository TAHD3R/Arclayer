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
    expected_version: int = Field(..., ge=1)
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


class MailTemplateRevisionMutationRequest(BaseSchema):
    expected_version: int = Field(..., ge=1)


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


MailTemplateRevisionAction = Literal["created", "updated", "restored", "deleted"]


class MailTemplateRevisionActorOut(BaseSchema):
    id: UUID
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


class MailTemplateRevisionOut(BaseSchema):
    id: UUID
    template_id: UUID
    key: str
    locale: str
    version: int
    action: MailTemplateRevisionAction
    changed_fields: list[str]
    actor: MailTemplateRevisionActorOut | None = None
    created_at: datetime


class MailTemplateRevisionDetailOut(MailTemplateRevisionOut):
    name: str
    description: str | None
    subject_template: str
    html_template: str
    text_template: str
    variables: list[str]
    is_enabled: bool


MailTemplateCategory = Literal[
    "account",
    "security",
    "invitation",
    "notification",
    "operations",
    "custom",
]
MailTemplateOwner = Literal["builtin", "plugin", "custom"]
MailTemplateValidationState = Literal["valid", "invalid"]
MailTemplateSourceState = Literal["default", "overridden", "custom"]
MailTemplateHealth = Literal["healthy", "partial", "disabled", "invalid"]


class MailTemplateLocaleOut(BaseSchema):
    id: UUID
    locale: str
    is_enabled: bool
    version: int
    updated_at: datetime
    validation_state: MailTemplateValidationState
    subject_preview: str
    source_state: MailTemplateSourceState


class MailTemplateGroupOut(BaseSchema):
    key: str
    name: str
    description: str | None
    category: MailTemplateCategory
    owner: MailTemplateOwner
    is_required: bool
    locales: list[MailTemplateLocaleOut]
    fallback_locale: str
    health: MailTemplateHealth
    latest_version: int
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


class MailTemplateTestSendRequest(BaseSchema):
    recipient: EmailStr
    variables: JsonObject = Field(default_factory=dict)


class MailTemplateTestSendOut(BaseSchema):
    state: Literal["accepted"]
    provider: str
    message_id: str | None = None
    attempts: int = Field(..., ge=1)
    latency_ms: float = Field(..., ge=0)
