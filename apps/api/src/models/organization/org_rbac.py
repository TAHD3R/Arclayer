from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


# Organization role (org-scoped RBAC).
class OrganizationRole(BaseModel):
    """Organization-scoped RBAC role."""

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="org_roles",
        on_delete=fields.CASCADE,
        db_index=True,
    )

    code = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)

    is_system = fields.BooleanField(default=False, db_index=True)
    is_builtin = fields.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        table = "organization_roles"
        abstract = False
        unique_together = (("organization_id", "code"),)


# Organization permission catalog entry.
class OrganizationPermission(BaseModel):
    """Organization-scoped permission catalog entry."""

    code = fields.CharField(max_length=128, unique=True, db_index=True)
    module = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)
    is_system = fields.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "organization_permissions"
        abstract = False


# Organization role -> permission grant edge.
class OrganizationRolePermission(BaseModel):
    """Organization role -> permission grant edge."""

    role = fields.ForeignKeyField(
        "models.OrganizationRole",
        related_name="role_permissions",
        on_delete=fields.CASCADE,
    )
    permission = fields.ForeignKeyField(
        "models.OrganizationPermission",
        related_name="permission_roles",
        on_delete=fields.CASCADE,
    )

    class Meta(BaseModel.Meta):
        table = "organization_role_permissions"
        abstract = False
        unique_together = ("role_id", "permission_id")
