from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class OrgMembership(BaseModel):
    """
    User membership in an organization.

    Notes:
    - v2 boundary model assumes A2: a user belongs to exactly one organization.
      We enforce this at the database level via UNIQUE(user_id).
    - `is_owner` is used for workspace visibility and creator-admin rules.
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

    is_owner = fields.BooleanField(default=False, db_index=True)
    status = fields.CharField(max_length=16, default="active", db_index=True)

    class Meta(BaseModel.Meta):
        table = "org_memberships"
        abstract = False
        # A2 invariant: one user can only belong to one organization.
