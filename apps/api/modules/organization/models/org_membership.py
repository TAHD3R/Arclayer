from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from apps.api.common.models.base import BaseModel


class OrgRole(StrEnum):
    """Organization-level role."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class OrgMembership(BaseModel):
    """
    User membership in an organization.

    Notes:
    - A user belongs to exactly one organization (enforced by UNIQUE(user_id)).
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
        # One user can only belong to one organization.
