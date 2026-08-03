from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class UserWebAuthnChallengePurpose(StrEnum):
    REGISTRATION = "registration"
    AUTHENTICATION = "authentication"


class UserWebAuthnCredential(BaseModel):
    """Product Account passkey or security-key credential."""

    user = fields.ForeignKeyField(
        "models.User",
        related_name="webauthn_credentials",
        on_delete=fields.CASCADE,
    )
    label = fields.CharField(max_length=128, null=True)
    credential_id = fields.CharField(max_length=1024, unique=True)
    credential_public_key = fields.TextField()
    sign_count = fields.BigIntField()
    relying_party_id = fields.CharField(max_length=255)
    last_used_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        user_id: UUID

    class Meta(BaseModel.Meta):
        table = "user_webauthn_credentials"
        table_description = "Verified Product Account WebAuthn credentials."
        abstract = False
        indexes = (("user_id", "created_at"),)


class UserWebAuthnChallenge(BaseModel):
    """Hashed single-use Product Account WebAuthn ceremony challenge."""

    user = fields.ForeignKeyField(
        "models.User",
        related_name="webauthn_challenges",
        on_delete=fields.CASCADE,
    )
    purpose = fields.CharEnumField(UserWebAuthnChallengePurpose, db_index=True)
    challenge_hash = fields.CharField(max_length=64, unique=True)
    binding_hash = fields.CharField(max_length=64)
    relying_party_id = fields.CharField(max_length=255)
    origin = fields.CharField(max_length=2048)
    expires_at = fields.DatetimeField(db_index=True)
    consumed_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        user_id: UUID

    class Meta(BaseModel.Meta):
        table = "user_webauthn_challenges"
        table_description = "Single-use Product Account WebAuthn registration and authentication challenges."
        abstract = False
        indexes = (("user_id", "purpose", "consumed_at", "expires_at"),)
