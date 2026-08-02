from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field, SecretStr, field_validator

from src.common.schemas import BaseSchema

MailServiceReadiness = Literal[
    "installed",
    "configured",
    "sender_verified",
    "reachable",
    "active",
    "degraded",
    "unavailable",
]
MailServiceAction = Literal[
    "configure",
    "configure_credentials",
    "test",
    "rotate_credentials",
    "disable",
    "recover",
]


class MailServiceSenderOut(BaseSchema):
    address: EmailStr | None = None
    name: str | None = None
    domain: str | None = None


class MailServiceActionOut(BaseSchema):
    action: MailServiceAction
    available: bool
    reason_code: str | None = None


class MailServiceOut(BaseSchema):
    revision: int = Field(ge=0)
    transport_revision: int = Field(ge=0)
    provider: str
    sender: MailServiceSenderOut
    credential_configured: bool
    installed: bool
    configured: bool
    sender_verified: bool
    reachable: bool
    active: bool
    desired_active: bool
    degraded: bool
    unavailable: bool
    readiness: MailServiceReadiness
    last_test_status: Literal["passed", "failed"] | None = None
    last_tested_at: datetime | None = None
    permitted_actions: list[MailServiceActionOut] = Field(default_factory=list)


class MailSmtpRoutePatch(BaseSchema):
    server: str | None = Field(default=None, min_length=1, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = Field(default=None, max_length=255)
    use_credentials: bool | None = None
    starttls: bool | None = None
    ssl_tls: bool | None = None


class MailServiceUpdateRequest(BaseSchema):
    expected_revision: int = Field(ge=0)
    idempotency_key: str = Field(min_length=8, max_length=255)
    provider: str | None = Field(default=None, min_length=1, max_length=64)
    sender_address: EmailStr | None = None
    sender_name: str | None = Field(default=None, min_length=1, max_length=160)
    sender_domain: str | None = Field(default=None, min_length=3, max_length=253)
    active: bool | None = None
    smtp: MailSmtpRoutePatch | None = None

    @field_validator("provider")
    @classmethod
    def normalize_provider(cls, value: str | None) -> str | None:
        return value.strip().lower() if value is not None else None

    @field_validator("sender_domain")
    @classmethod
    def normalize_domain(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower().strip(".")
        if not normalized or "@" in normalized or ".." in normalized:
            raise ValueError("MAIL_SENDER_DOMAIN_INVALID")
        return normalized


class MailCredentialWriteRequest(BaseSchema):
    expected_revision: int = Field(ge=0)
    idempotency_key: str = Field(min_length=8, max_length=255)
    secret: SecretStr = Field(..., exclude=True)
    username: str | None = Field(default=None, max_length=255)

    @field_validator("secret")
    @classmethod
    def validate_secret(cls, value: SecretStr) -> SecretStr:
        normalized = value.get_secret_value().strip()
        if not normalized or len(normalized) > 4096:
            raise ValueError("MAIL_CREDENTIAL_INVALID")
        return SecretStr(normalized)


class MailCredentialWriteOut(BaseSchema):
    provider: str
    configured: bool
    rotated: bool
    revision: int = Field(ge=0)


class MailServiceMutationRequest(BaseSchema):
    expected_revision: int = Field(ge=0)
    idempotency_key: str = Field(min_length=8, max_length=255)


class MailServiceTestRequest(BaseSchema):
    recipient: EmailStr
    expected_revision: int = Field(ge=0)
    idempotency_key: str = Field(min_length=8, max_length=255)


class MailServiceTestOut(BaseSchema):
    state: Literal["accepted"]
    provider: str
    message_id: str | None = None
    attempts: int = Field(ge=1)
    latency_ms: float = Field(ge=0)
    service: MailServiceOut
