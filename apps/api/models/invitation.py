from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from apps.api.models.base import BaseModel


class OrganizationInvitation(BaseModel):
    """
    Organization invitation for onboarding new members without public registration.
    """

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="invitations",
        on_delete=fields.CASCADE,
    )
    email = fields.CharField(max_length=255, db_index=True)
    role_code = fields.CharField(max_length=64, null=True, db_index=True)

    token_hash = fields.CharField(max_length=64, unique=True, db_index=True)
    expires_at = fields.DatetimeField(null=True, db_index=True)

    invited_by_user_id = fields.UUIDField(null=True, db_index=True)
    accepted_by_user_id = fields.UUIDField(null=True, db_index=True)
    accepted_at = fields.DatetimeField(null=True)

    revoked_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        organization_id: UUID
        email: str
        role_code: str | None
        token_hash: str
        expires_at: datetime | None
        invited_by_user_id: UUID | None
        accepted_by_user_id: UUID | None
        accepted_at: datetime | None
        revoked_at: datetime | None

    class Meta(BaseModel.Meta):
        table = "organization_invitations"
        abstract = False
