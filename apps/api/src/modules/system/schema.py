from __future__ import annotations

import re
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, EmailStr, Field, field_validator

from src.common.constants.auth import PASSWORD_REGEX
from src.common.schemas import BaseSchema
from src.modules.auth.schema import _normalize_account_name, _normalize_display_name


class SystemRuntimeCapabilities(BaseSchema):
    deployment_settings_enabled: bool = Field(
        ...,
        description="Whether instance-level deployment settings (e.g. storage/mail) are exposed to the admin UI.",
    )
    public_register_enabled: bool = Field(
        ...,
        description="Whether public account registration is enabled for this runtime.",
    )


class SystemInstanceSetupOut(BaseSchema):
    status: str = Field(..., description="Instance setup status: uninitialized, ready, repair_required.")
    repair_reason: str | None = Field(default=None, description="Explicit repair reason code when setup is invalid.")


class SystemRuntimeOut(BaseSchema):
    capabilities: SystemRuntimeCapabilities = Field(
        ...,
        description="Public runtime capabilities derived from concrete backend configuration.",
    )
    instance_setup: SystemInstanceSetupOut = Field(
        ...,
        description="Public instance setup state derived from install.lock and the Instance Owner singleton.",
    )


class PlatformBootstrapOut(BaseSchema):
    """Bootstrap result; Platform sign-in and MFA enrollment remain separate."""

    owner_identity_id: UUID = Field(description="The created Instance Owner authority identity.")
    mfa_setup_required: Literal[True] = Field(
        default=True,
        description="The Instance Owner must complete Platform MFA setup before Platform sign-in.",
    )


class PlatformSetupStateOut(BaseSchema):
    """Public Platform setup state, independent of the Product runtime probe."""

    status: str = Field(..., description="Platform setup status: uninitialized, ready, repair_required.")
    repair_reason: str | None = Field(default=None, description="Explicit repair reason code when setup is invalid.")


class SystemBootstrapRequest(BaseSchema):
    """Bootstrap the instance by creating the initial Instance Owner identity."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    username: str = Field(
        min_length=3,
        max_length=32,
        description="Account name (3-32 chars). Allowed: lowercase letters, numbers, and hyphens.",
        examples=["jasar", "team-owner"],
    )
    email: EmailStr = Field(description="Email address.", examples=["user@example.com"])
    password: str = Field(min_length=8, max_length=128, description="Password (min 8 chars).")
    display_name: str = Field(min_length=1, max_length=64, description="Display name.")

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return _normalize_account_name(value)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        normalized = _normalize_display_name(value)
        if normalized is None:
            raise ValueError("Display name is required.")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("Password must contain letters and numbers, and be 8-128 characters long.")
        return value
