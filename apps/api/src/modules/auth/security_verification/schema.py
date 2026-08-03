from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.modules.auth.webauthn.schema import (
    WebAuthnAuthenticationCredential,
    WebAuthnAuthenticationOptions,
)

SecurityAction = Literal[
    "change_password",
    "set_password",
    "confirm_email_change",
    "confirm_remove_password",
    "delete_my_account",
    "remove_webauthn_credential",
]


class SecurityVerificationTotpRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    action: SecurityAction
    code: str | None = Field(default=None, min_length=4, max_length=16)
    backup_code: str | None = Field(default=None, min_length=4, max_length=64)

    @model_validator(mode="after")
    def _validate_exactly_one(self):
        if bool(self.code) == bool(self.backup_code):
            raise ValueError("Provide exactly one of code or backup_code.")
        return self


class SecurityVerificationWebAuthnBeginRequest(BaseSchema):
    action: SecurityAction


class SecurityVerificationWebAuthnBeginOut(BaseSchema):
    options: WebAuthnAuthenticationOptions


class SecurityVerificationWebAuthnCompleteRequest(BaseSchema):
    action: SecurityAction
    challenge_id: UUID
    credential: WebAuthnAuthenticationCredential


class SecurityVerificationProofOut(BaseSchema):
    proof: str = Field(min_length=32, max_length=512)
    expires_in: int = Field(gt=0)
