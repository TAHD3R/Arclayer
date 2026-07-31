from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class PlatformMfaMethodKind(StrEnum):
    WEBAUTHN = "webauthn"
    TOTP = "totp"


class PlatformMfaMethodStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    REVOKED = "revoked"


class PlatformWebAuthnChallengePurpose(StrEnum):
    REGISTRATION = "registration"
    AUTHENTICATION = "authentication"


class PlatformAuthFlowPurpose(StrEnum):
    SETUP = "setup"
    LOGIN_MFA = "login_mfa"


class PlatformMfaMethod(BaseModel):
    """A locally verified Platform MFA method, never imported from Product MFA."""

    user = fields.ForeignKeyField("models.User", related_name="platform_mfa_methods", on_delete=fields.RESTRICT)
    kind = fields.CharEnumField(PlatformMfaMethodKind, db_index=True)
    status = fields.CharEnumField(PlatformMfaMethodStatus, default=PlatformMfaMethodStatus.PENDING, db_index=True)
    label = fields.CharField(max_length=128, null=True)
    credential_id = fields.CharField(max_length=1024, null=True, unique=True)
    credential_public_key = fields.TextField(null=True)
    sign_count = fields.BigIntField(null=True)
    relying_party_id = fields.CharField(max_length=255, null=True)
    totp_secret_enc = fields.TextField(null=True)
    verified_at = fields.DatetimeField(null=True, db_index=True)
    revoked_at = fields.DatetimeField(null=True, db_index=True)
    last_totp_counter = fields.BigIntField(null=True)
    last_used_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        user_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_mfa_methods"
        table_description = "Locally enrolled Platform MFA methods and verified WebAuthn credentials."
        abstract = False
        indexes = (("user_id", "status", "kind"),)


class PlatformWebAuthnChallenge(BaseModel):
    """Hashed, single-use ceremony challenge bound to one Platform flow context."""

    user = fields.ForeignKeyField(
        "models.User",
        related_name="platform_webauthn_challenges",
        on_delete=fields.CASCADE,
    )
    purpose = fields.CharEnumField(PlatformWebAuthnChallengePurpose, db_index=True)
    challenge_hash = fields.CharField(max_length=64, unique=True)
    binding_hash = fields.CharField(max_length=64)
    relying_party_id = fields.CharField(max_length=255)
    origin = fields.CharField(max_length=2048)
    expires_at = fields.DatetimeField(db_index=True)
    consumed_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        user_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_webauthn_challenges"
        table_description = "Single-use Platform WebAuthn registration and authentication challenges."
        abstract = False
        indexes = (("user_id", "purpose", "consumed_at", "expires_at"),)


class PlatformAuthFlowChallenge(BaseModel):
    """Durable identity-authenticated setup/login flow token; never a Platform Session."""

    user = fields.ForeignKeyField(
        "models.User",
        related_name="platform_auth_flow_challenges",
        on_delete=fields.CASCADE,
    )
    purpose = fields.CharEnumField(PlatformAuthFlowPurpose, db_index=True)
    token_hash = fields.CharField(max_length=64, unique=True)
    identity_revision = fields.BigIntField()
    expires_at = fields.DatetimeField(db_index=True)
    consumed_at = fields.DatetimeField(null=True, db_index=True)
    failure_count = fields.BigIntField(default=0)
    last_failure_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        user_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_auth_flow_challenges"
        table_description = "Hashed single-use Platform setup and login-MFA flow tokens."
        abstract = False
        indexes = (("user_id", "purpose", "consumed_at", "expires_at"),)


class PlatformMfaRecoveryCode(BaseModel):
    """One hashed, single-use recovery code for a non-owner Platform Operator."""

    operator = fields.ForeignKeyField(
        "models.PlatformOperator",
        related_name="mfa_recovery_codes",
        on_delete=fields.CASCADE,
    )
    salt = fields.CharField(max_length=64)
    code_hash = fields.CharField(max_length=128)
    used_at = fields.DatetimeField(null=True, db_index=True)
    invalidated_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        operator_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_mfa_recovery_codes"
        table_description = "Hashed single-use Platform Operator MFA recovery codes."
        abstract = False
        indexes = (("operator_id", "used_at", "invalidated_at"),)
