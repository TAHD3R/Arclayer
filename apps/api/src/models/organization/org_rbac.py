from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Organization role (org-scoped RBAC).
class OrganizationRole(BaseModel):
    """Domain model for organization roles."""

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="org_roles",
        on_delete=fields.CASCADE,
        db_index=True,
    )

    code = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)
    name_i18n = fields.CharField(max_length=200, null=True)
    description_i18n = fields.CharField(max_length=200, null=True)

    is_system = fields.BooleanField(default=False, db_index=True)
    is_builtin = fields.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        table = "organization_roles"
        abstract = False
        unique_together = (("organization_id", "code"),)


# Organization permission catalog entry.
class OrganizationPermission(BaseModel):
    """Domain model for organization permissions."""

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
    """Domain model for organization role permissions."""

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
