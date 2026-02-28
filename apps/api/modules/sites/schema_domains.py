from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import ConfigDict, Field, field_validator

from apps.api.common.schemas import BaseSchema
from apps.api.common.types.public_uuid import PublicUUID


def _normalize_hostname(value: str) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    # Strip port for common Host header formats like "example.com:443".
    if ":" in raw and "]" not in raw:
        raw = raw.split(":", 1)[0]
    # Remove a trailing dot (FQDN form).
    raw = raw.rstrip(".")
    return raw


class SiteDomainCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    hostname: Annotated[str, Field(..., description="Custom hostname to bind (e.g. example.com).")]

    @field_validator("hostname", mode="after")
    @classmethod
    def _norm_hostname(cls, v: str) -> str:
        return _normalize_hostname(v)


class SiteDomainUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    is_active: bool | None = Field(
        default=None,
        alias="isActive",
        description="Whether the domain is active (only takes effect when verified).",
    )


class SiteDomainOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    domain_id: PublicUUID = Field(..., alias="domainId", description="Domain record id.")
    site_id: PublicUUID = Field(..., alias="siteId", description="Site id.")

    hostname: str = Field(..., description="Bound hostname (lowercase, no port).")

    is_verified: bool = Field(..., alias="isVerified", description="Whether the domain is verified via DNS TXT.")
    is_active: bool = Field(..., alias="isActive", description="Whether the domain is enabled for routing.")

    verification_token: str = Field(
        ...,
        alias="verificationToken",
        description="DNS TXT verification token (value to publish).",
    )
    verified_at_ms: int | None = Field(
        default=None,
        alias="verifiedAtMs",
        description="Verification timestamp in milliseconds (UTC).",
    )
    created_by_user_id: PublicUUID | None = Field(
        default=None,
        alias="createdByUserId",
        description="User id that created the binding.",
    )


class SiteDomainDnsInstructionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    txt_record_name: str = Field(
        ...,
        alias="txtRecordName",
        description="DNS TXT record name to publish (FQDN).",
    )
    txt_record_value: str = Field(
        ...,
        alias="txtRecordValue",
        description="DNS TXT record value to publish.",
    )


class SiteDomainCreateOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    domain: SiteDomainOut = Field(..., description="Created domain binding.")
    dns: SiteDomainDnsInstructionOut = Field(..., description="DNS TXT verification instructions.")


class SiteDomainVerifyOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    domain: SiteDomainOut = Field(..., description="Domain binding after verification attempt.")
    dns: SiteDomainDnsInstructionOut = Field(..., description="DNS TXT verification instructions.")
    observed_txt_values: list[str] = Field(
        default_factory=list,
        alias="observedTxtValues",
        description="Observed TXT values from DNS lookup (best-effort, truncated).",
    )


class SiteDomainDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    domain_id: PublicUUID = Field(..., alias="domainId", description="Deleted domain record id.")


def domain_datetime_to_ms(value: datetime | None) -> int | None:
    if not isinstance(value, datetime):
        return None
    return int(value.timestamp() * 1000)
