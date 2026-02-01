from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from apps.api.models.base import BaseModel


class OrgRole(StrEnum):
    """Organization-level role."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class OrgMembership(BaseModel):
    """
    User membership in an organization.

    Notes:
    - v2 boundary model assumes A2: a user belongs to exactly one organization.
      We enforce this at the database level via UNIQUE(user_id).
    - `role` is used for organization-level governance (e.g. plugin management).
    """

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="org_memberships",
        on_delete=fields.CASCADE,
    )
    user = fields.ForeignKeyField(
        "models.User",
        related_name="org_memberships",
        on_delete=fields.CASCADE,
        unique=True,
    )

    role = fields.CharEnumField(OrgRole, default=OrgRole.MEMBER, db_index=True)
    status = fields.CharField(max_length=16, default="active", db_index=True)

    class Meta(BaseModel.Meta):
        table = "org_memberships"
        abstract = False
        # A2 invariant: one user can only belong to one organization.
