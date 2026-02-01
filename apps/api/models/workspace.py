from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from apps.api.models.base import BaseModel


class WorkspaceMembershipStatus(StrEnum):
    """Workspace membership status."""

    ACTIVE = "active"
    INVITED = "invited"
    DISABLED = "disabled"


class Workspace(BaseModel):
    """Workspace (project) under an organization."""

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="workspaces",
        on_delete=fields.CASCADE,
    )
    slug = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    is_active = fields.BooleanField(default=True, db_index=True)

    created_by_user_id = fields.UUIDField(db_index=True)

    class Meta(BaseModel.Meta):
        table = "workspaces"
        abstract = False
        unique_together = (("organization_id", "slug"),)


class WorkspaceMembership(BaseModel):
    """User membership in a workspace (the admin governance boundary)."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="memberships",
        on_delete=fields.CASCADE,
    )
    user = fields.ForeignKeyField(
        "models.User",
        related_name="workspace_memberships",
        on_delete=fields.CASCADE,
    )
    status = fields.CharEnumField(WorkspaceMembershipStatus, default=WorkspaceMembershipStatus.ACTIVE, db_index=True)

    invited_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "workspace_memberships"
        abstract = False
        unique_together = (("workspace_id", "user_id"),)


class WorkspaceMembershipRole(BaseModel):
    """Role binding for a workspace membership."""

    membership = fields.ForeignKeyField(
        "models.WorkspaceMembership",
        related_name="membership_roles",
        on_delete=fields.CASCADE,
    )
    role = fields.ForeignKeyField("models.Role", related_name="workspace_membership_roles", on_delete=fields.CASCADE)

    class Meta(BaseModel.Meta):
        table = "workspace_membership_roles"
        abstract = False
        unique_together = (("membership_id", "role_id"),)
