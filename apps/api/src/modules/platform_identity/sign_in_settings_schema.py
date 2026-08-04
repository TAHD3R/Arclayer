from __future__ import annotations

from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema


class PlatformRegistrationSettingsOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    public_registration_enabled: bool
    require_email: bool
    require_email_verification: bool
    email_domains_allowlist: tuple[str, ...]


class PlatformProvisioningSettingsOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    auto_provision_enabled: bool
    auto_accept_email_invites: bool


class PlatformSignInProviderSettingsOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    key: str
    label: str
    installed: bool
    enabled: bool
    configured: bool
    client_id: str | None
    has_client_secret: bool


class PlatformSignInSettingsOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    revision: int = Field(ge=1)
    registration: PlatformRegistrationSettingsOut
    provisioning: PlatformProvisioningSettingsOut
    providers: tuple[PlatformSignInProviderSettingsOut, ...]


class PlatformSignInPolicyUpdateRequest(BaseSchema):
    model_config = ConfigDict(frozen=True)

    expected_revision: int = Field(ge=1)
    public_registration_enabled: bool
    require_email: bool
    require_email_verification: bool
    email_domains_allowlist: tuple[str, ...] = ()
    auto_provision_enabled: bool
    auto_accept_email_invites: bool
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID
    step_up_proof: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_registration_policy(self) -> PlatformSignInPolicyUpdateRequest:
        if self.require_email_verification and not self.require_email:
            raise ValueError("Email verification requires email addresses")
        if self.email_domains_allowlist and not self.require_email:
            raise ValueError("An email domain allowlist requires email addresses")
        return self


class PlatformSignInProviderUpdateRequest(BaseSchema):
    model_config = ConfigDict(frozen=True)

    expected_revision: int = Field(ge=1)
    enabled: bool
    client_id: str = Field(max_length=512)
    client_secret: str | None = Field(default=None, max_length=4096)
    clear_client_secret: bool = False
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID
    step_up_proof: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_secret_change(self) -> PlatformSignInProviderUpdateRequest:
        if self.client_secret and self.clear_client_secret:
            raise ValueError("Provide a replacement secret or clear the existing secret, not both")
        return self


class PlatformSignInProviderDeleteRequest(BaseSchema):
    model_config = ConfigDict(frozen=True)

    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID
    step_up_proof: str = Field(min_length=1)
