from __future__ import annotations

import re
from typing import Final

from pydantic import ConfigDict, Field, model_validator

from apps.api.src.common.schemas import BaseSchema

_TOTP_CODE_REGEX: Final[re.Pattern[str]] = re.compile(r"^\s*\d[\d\s-]{4,14}\d\s*$")
_BACKUP_CODE_REGEX: Final[re.Pattern[str]] = re.compile(r"^\s*[A-Za-z0-9][A-Za-z0-9\s-]{4,64}\s*$")


class TwoFactorSetupRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    password: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        description="Current password for re-auth (required when the account has a password).",
    )


class TwoFactorStatusOut(BaseSchema):
    enabled: bool = Field(..., description="Whether 2FA is enabled.")
    backup_codes_remaining: int = Field(..., ge=0, description="Number of unused backup codes.")


class TwoFactorSetupOut(BaseSchema):
    secret: str = Field(..., description="Base32 TOTP secret. Show it once to the user.")
    otpauth_uri: str = Field(..., description="otpauth URI for Authenticator apps.")


class TwoFactorConfirmRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(..., min_length=4, max_length=16, description="TOTP code from Authenticator app.")

    @model_validator(mode="after")
    def _validate_format(self):
        if not _TOTP_CODE_REGEX.match(self.code or ""):
            raise ValueError("Invalid TOTP code format.")
        return self


class TwoFactorConfirmOut(BaseSchema):
    backup_codes: list[str] = Field(..., description="One-time backup codes. Shown only once.")


class TwoFactorDisableRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    code: str | None = Field(default=None, min_length=4, max_length=16, description="TOTP code.")
    backup_code: str | None = Field(default=None, min_length=4, max_length=64, description="Backup code.")

    @model_validator(mode="after")
    def _validate_one_of(self):
        has_totp = bool(self.code and self.code.strip())
        has_backup = bool(self.backup_code and self.backup_code.strip())
        if has_totp == has_backup:
            raise ValueError("Provide exactly one of code or backup_code.")
        if has_totp and not _TOTP_CODE_REGEX.match(self.code or ""):
            raise ValueError("Invalid TOTP code format.")
        if has_backup and not _BACKUP_CODE_REGEX.match(self.backup_code or ""):
            raise ValueError("Invalid backup code format.")
        return self


class TwoFactorRegenerateBackupCodesRequest(TwoFactorDisableRequest):
    pass


class TwoFactorRegenerateBackupCodesOut(BaseSchema):
    backup_codes: list[str]


class TwoFactorLoginRequest(BaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True)

    two_factor_token: str = Field(..., min_length=8, max_length=512, description="2FA challenge token.")
    code: str | None = Field(default=None, min_length=4, max_length=16, description="TOTP code.")
    backup_code: str | None = Field(default=None, min_length=4, max_length=64, description="Backup code.")

    @model_validator(mode="after")
    def _validate_one_of(self):
        has_totp = bool(self.code and self.code.strip())
        has_backup = bool(self.backup_code and self.backup_code.strip())
        if has_totp == has_backup:
            raise ValueError("Provide exactly one of code or backup_code.")
        if has_totp and not _TOTP_CODE_REGEX.match(self.code or ""):
            raise ValueError("Invalid TOTP code format.")
        if has_backup and not _BACKUP_CODE_REGEX.match(self.backup_code or ""):
            raise ValueError("Invalid backup code format.")
        return self
