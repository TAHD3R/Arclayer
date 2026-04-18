from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class OrgRole(StrEnum):
    """Organization-level role."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


# Organization membership (user -> organization).
class OrgMembership(BaseModel):
    """Domain model for organization memberships.

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

    if TYPE_CHECKING:
        organization_id: UUID
        user_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_org_memberships"
        abstract = False
        unique_together = (("organization", "user"),)
