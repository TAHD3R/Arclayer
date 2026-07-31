from __future__ import annotations

from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.modules.platform_identity.mfa_schema import PlatformRecoveryCodeSet, PlatformTotpSetup
from src.modules.platform_identity.session_schema import PlatformSessionCredential
from src.modules.platform_identity.webauthn_schema import (
    PlatformWebAuthnAuthenticationCredential,
    PlatformWebAuthnAuthenticationOptions,
    PlatformWebAuthnRegistrationCredential,
    PlatformWebAuthnRegistrationOptions,
)


class PlatformAuthState(StrEnum):
    MFA_SETUP_REQUIRED = "mfa_setup_required"
    PHISHING_RESISTANT_SETUP_REQUIRED = "phishing_resistant_setup_required"
    MFA_CHALLENGE_REQUIRED = "mfa_challenge_required"
    AUTHENTICATED = "authenticated"


class PlatformAuthMethodKind(StrEnum):
    SECURITY_KEY_OR_PASSKEY = "security_key_or_passkey"
    AUTHENTICATOR_APP = "authenticator_app"


class PlatformSignInRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    identifier: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class PlatformAuthMethodOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    method_id: UUID
    kind: PlatformAuthMethodKind
    label: str | None = Field(default=None, max_length=128)


class PlatformSignInOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    state: PlatformAuthState
    flow_token: str = Field(min_length=32)
    expires_in: int = Field(ge=1)
    methods: tuple[PlatformAuthMethodOut, ...] = ()


class PlatformTotpSetupRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    flow_token: str = Field(min_length=32)


class PlatformTotpSetupOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    state: Literal[PlatformAuthState.MFA_SETUP_REQUIRED] = PlatformAuthState.MFA_SETUP_REQUIRED
    setup: PlatformTotpSetup


class PlatformTotpSetupConfirmRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    flow_token: str = Field(min_length=32)
    method_id: UUID
    code: str = Field(min_length=6, max_length=12)


class PlatformTotpChallengeRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    flow_token: str = Field(min_length=32)
    method_id: UUID
    code: str = Field(min_length=6, max_length=12)


class PlatformSessionIssuedOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    state: Literal[PlatformAuthState.AUTHENTICATED] = PlatformAuthState.AUTHENTICATED
    credential: PlatformSessionCredential
    recovery_codes: PlatformRecoveryCodeSet | None = None


class PlatformWebAuthnBeginRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    flow_token: str = Field(min_length=32)


class PlatformWebAuthnRegistrationBeginOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    state: Literal[PlatformAuthState.PHISHING_RESISTANT_SETUP_REQUIRED] = (
        PlatformAuthState.PHISHING_RESISTANT_SETUP_REQUIRED
    )
    options: PlatformWebAuthnRegistrationOptions


class PlatformWebAuthnRegistrationCompleteRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    flow_token: str = Field(min_length=32)
    challenge_id: UUID
    credential: PlatformWebAuthnRegistrationCredential


class PlatformWebAuthnAuthenticationBeginOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    state: Literal[PlatformAuthState.MFA_CHALLENGE_REQUIRED] = PlatformAuthState.MFA_CHALLENGE_REQUIRED
    options: PlatformWebAuthnAuthenticationOptions


class PlatformWebAuthnAuthenticationCompleteRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    flow_token: str = Field(min_length=32)
    challenge_id: UUID
    credential: PlatformWebAuthnAuthenticationCredential
