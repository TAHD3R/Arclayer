from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema


class PlatformMfaSetupState(StrEnum):
    PENDING_VERIFICATION = "pending_verification"
    VERIFIED = "verified"
    RECOVERY_ENROLLMENT_REQUIRED = "recovery_enrollment_required"


class PlatformMfaAssurance(StrEnum):
    BASELINE = "baseline"
    PHISHING_RESISTANT = "phishing_resistant"


class PlatformTotpSetup(BaseSchema):
    """One-time setup material. The secret is intentionally never persisted in this schema."""

    model_config = ConfigDict(frozen=True)

    method_id: UUID
    state: PlatformMfaSetupState
    secret: str = Field(min_length=1)
    issuer: str = Field(min_length=1, max_length=128)
    account_label: str = Field(min_length=1, max_length=256)


class PlatformMfaVerification(BaseSchema):
    model_config = ConfigDict(frozen=True)

    method_id: UUID
    assurance: PlatformMfaAssurance


class PlatformRecoveryCodeSet(BaseSchema):
    """One-time display of newly generated recovery codes."""

    model_config = ConfigDict(frozen=True)

    state: PlatformMfaSetupState
    codes: tuple[str, ...] = Field(min_length=1)


class PlatformMfaRecoveryState(BaseSchema):
    model_config = ConfigDict(frozen=True)

    state: PlatformMfaSetupState
