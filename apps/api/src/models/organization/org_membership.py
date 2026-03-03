from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class OrgRole(StrEnum):
    """Organization-level role."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


# Organization membership (user -> organization).
class OrgMembership(BaseModel):
    """
    User membership in an organization.

    Notes:
    - A user can belong to multiple organizations.
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
    )

    role = fields.CharEnumField(OrgRole, default=OrgRole.MEMBER, db_index=True)
    # role_code keeps the source role semantics for org RBAC templates.
    # Built-in roles use owner/admin/member; template roles use custom codes.
    role_code = fields.CharField(max_length=64, default=OrgRole.MEMBER.value, db_index=True)
    status = fields.CharField(max_length=16, default="active", db_index=True)

    class Meta(BaseModel.Meta):
        table = "org_memberships"
        abstract = False
        unique_together = (("organization", "user"),)
