from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AliasChoices, ConfigDict, Field

from src.common.schemas import BaseSchema


class WebAuthnRelyingParty(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=128)


class WebAuthnUser(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=256)
    display_name: str = Field(min_length=1, max_length=256)


class WebAuthnCredentialParameter(BaseSchema):
    model_config = ConfigDict(frozen=True)

    type: Literal["public-key"] = "public-key"
    alg: int


class WebAuthnCredentialDescriptor(BaseSchema):
    model_config = ConfigDict(frozen=True)

    type: Literal["public-key"] = "public-key"
    id: str = Field(min_length=1, max_length=2048)
    transports: tuple[str, ...] = ()


class WebAuthnAuthenticatorSelection(BaseSchema):
    model_config = ConfigDict(frozen=True)

    resident_key: Literal["preferred"] = "preferred"
    require_resident_key: Literal[False] = False
    user_verification: Literal["required"] = "required"


class WebAuthnRegistrationOptions(BaseSchema):
    model_config = ConfigDict(frozen=True)

    challenge_id: UUID
    challenge: str = Field(min_length=32, max_length=512)
    rp: WebAuthnRelyingParty
    user: WebAuthnUser
    pub_key_cred_params: tuple[WebAuthnCredentialParameter, ...] = Field(min_length=1)
    timeout: int = Field(gt=0)
    exclude_credentials: tuple[WebAuthnCredentialDescriptor, ...] = ()
    authenticator_selection: WebAuthnAuthenticatorSelection = Field(default_factory=WebAuthnAuthenticatorSelection)
    attestation: Literal["none"] = "none"


class WebAuthnAuthenticationOptions(BaseSchema):
    model_config = ConfigDict(frozen=True)

    challenge_id: UUID
    challenge: str = Field(min_length=32, max_length=512)
    rp_id: str = Field(min_length=1, max_length=255)
    timeout: int = Field(gt=0)
    allow_credentials: tuple[WebAuthnCredentialDescriptor, ...] = Field(min_length=1)
    user_verification: Literal["required"] = "required"


class WebAuthnAttestationResponse(BaseSchema):
    model_config = ConfigDict(frozen=True)

    client_data_json: str = Field(
        min_length=1,
        max_length=131_072,
        validation_alias=AliasChoices("clientDataJSON", "clientDataJson", "client_data_json"),
        serialization_alias="clientDataJSON",
    )
    attestation_object: str = Field(min_length=1, max_length=262_144)
    transports: tuple[str, ...] = ()


class WebAuthnRegistrationCredential(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=2048)
    raw_id: str = Field(min_length=1, max_length=2048)
    type: Literal["public-key"] = "public-key"
    response: WebAuthnAttestationResponse


class WebAuthnAssertionResponse(BaseSchema):
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


class WebAuthnAuthenticationCredential(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: str = Field(min_length=1, max_length=2048)
    raw_id: str = Field(min_length=1, max_length=2048)
    type: Literal["public-key"] = "public-key"
    response: WebAuthnAssertionResponse


class WebAuthnCredentialOut(BaseSchema):
    id: UUID
    label: str | None = None
    created_at: datetime
    last_used_at: datetime | None = None


class WebAuthnCredentialListOut(BaseSchema):
    items: list[WebAuthnCredentialOut] = Field(default_factory=list)


class WebAuthnCredentialDeleteRequest(BaseSchema):
    mfa_proof: str | None = Field(default=None, min_length=32, max_length=512)


class WebAuthnRegistrationBeginRequest(BaseSchema):
    password: str | None = Field(default=None, min_length=1, max_length=128)


class WebAuthnRegistrationBeginOut(BaseSchema):
    options: WebAuthnRegistrationOptions


class WebAuthnRegistrationCompleteRequest(BaseSchema):
    challenge_id: UUID
    credential: WebAuthnRegistrationCredential
    label: str | None = Field(default=None, max_length=128)


class WebAuthnAuthenticationBeginOut(BaseSchema):
    options: WebAuthnAuthenticationOptions


class WebAuthnAuthenticationCompleteRequest(BaseSchema):
    challenge_id: UUID
    credential: WebAuthnAuthenticationCredential


class WebAuthnLoginBeginRequest(BaseSchema):
    two_factor_token: str = Field(min_length=8, max_length=512)


class WebAuthnLoginCompleteRequest(WebAuthnLoginBeginRequest):
    challenge_id: UUID
    credential: WebAuthnAuthenticationCredential


class VerifiedWebAuthnRegistration(BaseSchema):
    model_config = ConfigDict(frozen=True)

    credential_id: str
    credential_public_key: str
    sign_count: int
    user_verified: bool


class VerifiedWebAuthnAuthentication(BaseSchema):
    model_config = ConfigDict(frozen=True)

    credential_id: str
    sign_count: int
    user_verified: bool
