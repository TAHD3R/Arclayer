from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AliasChoices, ConfigDict, Field

from src.common.schemas import BaseSchema
from src.models.platform_identity.mfa import PlatformAuthFlowPurpose
from src.modules.platform_identity.mfa_schema import PlatformMfaAssurance, PlatformRecoveryCodeSet


class PlatformWebAuthnRelyingParty(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=128)


class PlatformWebAuthnUser(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=256)
    display_name: str = Field(min_length=1, max_length=256)


class PlatformWebAuthnCredentialParameter(BaseSchema):
    model_config = ConfigDict(frozen=True)

    type: Literal["public-key"] = "public-key"
    alg: int


class PlatformWebAuthnCredentialDescriptor(BaseSchema):
    model_config = ConfigDict(frozen=True)

    type: Literal["public-key"] = "public-key"
    id: str = Field(min_length=1, max_length=2048)
    transports: tuple[str, ...] = ()


class PlatformWebAuthnAuthenticatorSelection(BaseSchema):
    model_config = ConfigDict(frozen=True)

    resident_key: Literal["preferred"] = "preferred"
    require_resident_key: Literal[False] = False
    user_verification: Literal["required"] = "required"


class PlatformWebAuthnRegistrationOptions(BaseSchema):
    """Browser-compatible creation options plus the server challenge identity."""

    model_config = ConfigDict(frozen=True)

    challenge_id: UUID
    challenge: str = Field(min_length=32, max_length=512)
    rp: PlatformWebAuthnRelyingParty
    user: PlatformWebAuthnUser
    pub_key_cred_params: tuple[PlatformWebAuthnCredentialParameter, ...] = Field(min_length=1)
    timeout: int = Field(gt=0)
    exclude_credentials: tuple[PlatformWebAuthnCredentialDescriptor, ...] = ()
    authenticator_selection: PlatformWebAuthnAuthenticatorSelection = Field(
        default_factory=PlatformWebAuthnAuthenticatorSelection
    )
    attestation: Literal["none"] = "none"


class PlatformWebAuthnAuthenticationOptions(BaseSchema):
    """Browser-compatible request options requiring local user verification."""

    model_config = ConfigDict(frozen=True)

    challenge_id: UUID
    challenge: str = Field(min_length=32, max_length=512)
    rp_id: str = Field(min_length=1, max_length=255)
    timeout: int = Field(gt=0)
    allow_credentials: tuple[PlatformWebAuthnCredentialDescriptor, ...] = Field(min_length=1)
    user_verification: Literal["required"] = "required"


class PlatformWebAuthnAttestationResponse(BaseSchema):
    model_config = ConfigDict(frozen=True)

    client_data_json: str = Field(
        min_length=1,
        max_length=131_072,
        validation_alias=AliasChoices("clientDataJSON", "clientDataJson", "client_data_json"),
        serialization_alias="clientDataJSON",
    )
    attestation_object: str = Field(min_length=1, max_length=262_144)
    transports: tuple[str, ...] = ()


class PlatformWebAuthnRegistrationCredential(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=2048)
    raw_id: str = Field(min_length=1, max_length=2048)
    type: Literal["public-key"] = "public-key"
    response: PlatformWebAuthnAttestationResponse


class PlatformWebAuthnAssertionResponse(BaseSchema):
    model_config = ConfigDict(frozen=True)

    client_data_json: str = Field(
        min_length=1,
        max_length=131_072,
        validation_alias=AliasChoices("clientDataJSON", "clientDataJson", "client_data_json"),
        serialization_alias="clientDataJSON",
    )
    authenticator_data: str = Field(min_length=1, max_length=131_072)
    signature: str = Field(min_length=1, max_length=131_072)
    user_handle: str | None = Field(default=None, max_length=2048)


class PlatformWebAuthnAuthenticationCredential(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=2048)
    raw_id: str = Field(min_length=1, max_length=2048)
    type: Literal["public-key"] = "public-key"
    response: PlatformWebAuthnAssertionResponse


class VerifiedPlatformWebAuthnRegistration(BaseSchema):
    model_config = ConfigDict(frozen=True)

    credential_id: str
    credential_public_key: str
    sign_count: int
    user_verified: bool


class VerifiedPlatformWebAuthnAuthentication(BaseSchema):
    model_config = ConfigDict(frozen=True)

    credential_id: str
    sign_count: int
    user_verified: bool


class PlatformWebAuthnEnrollmentResult(BaseSchema):
    model_config = ConfigDict(frozen=True)

    method_id: UUID
    assurance: Literal[PlatformMfaAssurance.PHISHING_RESISTANT] = PlatformMfaAssurance.PHISHING_RESISTANT
    recovery_codes: PlatformRecoveryCodeSet | None = None


class PlatformAuthFlowIssued(BaseSchema):
    """Raw flow token is returned once and stored only through its SHA-256 hash."""

    model_config = ConfigDict(frozen=True)

    flow_id: UUID
    token: str = Field(min_length=32, max_length=512)
    expires_at: datetime


class PlatformAuthFlowRecord(BaseSchema):
    model_config = ConfigDict(frozen=True)

    flow_id: UUID
    user_id: UUID
    purpose: PlatformAuthFlowPurpose
    identity_revision: int = Field(ge=0)
    invitation_id: UUID | None = None
    invitation_revision: int | None = Field(default=None, ge=1)
    requires_phishing_resistant: bool = False
    expires_at: datetime
    failure_count: int = Field(ge=0)
