from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from apps.api.models.base import BaseModel


class MembershipStatus(StrEnum):
    """Membership status."""

    ACTIVE = "active"
    INVITED = "invited"
    DISABLED = "disabled"


class Organization(BaseModel):
    """
    Tenant boundary (workspace/site).
    """

    slug = fields.CharField(max_length=64, unique=True, db_index=True)
    name = fields.CharField(max_length=128)
    logo_url = fields.CharField(max_length=512, null=True)
    is_active = fields.BooleanField(default=True, db_index=True)

    if TYPE_CHECKING:
        slug: str
        name: str
        logo_url: str | None
        is_active: bool

    class Meta(BaseModel.Meta):
        table = "organizations"
        abstract = False


class Membership(BaseModel):
    """
    User membership in an organization (identity under a tenant).
    """

    user = fields.ForeignKeyField("models.User", related_name="memberships", on_delete=fields.CASCADE)
    organization = fields.ForeignKeyField("models.Organization", related_name="memberships", on_delete=fields.CASCADE)
    status = fields.CharEnumField(MembershipStatus, default=MembershipStatus.ACTIVE, db_index=True)
    invited_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        from tortoise.fields.relational import ReverseRelation

        from apps.api.models.rbac import MembershipRole

        status: MembershipStatus
        invited_by_user_id: UUID | None
        membership_roles: ReverseRelation[MembershipRole]

    class Meta(BaseModel.Meta):
        table = "memberships"
        unique_together = ("user_id", "organization_id")
        abstract = False
