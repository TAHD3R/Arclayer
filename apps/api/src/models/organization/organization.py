from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class OrganizationKind(StrEnum):
    """Organization identity kind."""

    PERSONAL = "personal"
    TEAM = "team"


# Organization (tenant boundary).
class Organization(BaseModel):
    """Domain model for organizations.

    Organization (account-level container).

    v2 boundary model:
    - Organization is the account container and the future home for billing/SSO/audit/security policies.
    - Workspace is the project/site governance boundary used by the admin console.
    """

    slug = fields.CharField(max_length=64, unique=True, db_index=True)
    name = fields.CharField(max_length=128)
    kind = fields.CharEnumField(OrganizationKind, default=OrganizationKind.TEAM, db_index=True)
    owner_user_id = fields.UUIDField(null=True, db_index=True)
    logo_url = fields.CharField(max_length=512, null=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    deleted_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "organizations"
        abstract = False
        unique_together = (("kind", "owner_user_id"),)
