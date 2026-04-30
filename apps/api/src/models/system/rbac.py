from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class PermissionScope(StrEnum):
    """Permission scope boundary."""

    ORG = "org"
    WORKSPACE = "workspace"
    PROJECT = "project"


# RBAC role (workspace-scoped).
class Role(BaseModel):
    """Internal model for roles.

    Workspace-scoped RBAC role.

    Notes:
    - Roles are workspace-private: `code` only needs to be unique within a workspace.
    - System roles are immutable (cannot be deleted and their permissions cannot be edited).
    - `is_superuser` means "has all permissions".
    """

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="roles",
        on_delete=fields.CASCADE,
        db_index=True,
    )

    code = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)

    # i18n:
    # - System roles use `*_i18n` pointing to locale resources (e.g. "rbac:ROLE_ADMIN_NAME").
    name_i18n = fields.CharField(max_length=200, null=True)
    description_i18n = fields.CharField(max_length=200, null=True)

    is_system = fields.BooleanField(default=False, db_index=True)
    is_default = fields.BooleanField(default=False, db_index=True)
    is_superuser = fields.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        table = "internal_roles"
        abstract = False
        unique_together = (("workspace_id", "code"),)


# RBAC permission catalog entry.
class Permission(BaseModel):
    """Internal model for permissions.

    RBAC permission.

    Notes:
    - `code` is the stable identifier, typically namespaced (e.g. "admin:access").
    - `owner_key` groups permissions by catalog owner (core uses "core").
    - `scope` controls where the permission can be granted/checked (org vs workspace).
    """

    code = fields.CharField(max_length=128, unique=True, db_index=True)
    scope = fields.CharEnumField(PermissionScope, default=PermissionScope.WORKSPACE, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)
    name_i18n = fields.CharField(max_length=200, null=True)
    description_i18n = fields.CharField(max_length=200, null=True)
    owner_key = fields.CharField(max_length=128, null=True, db_index=True, source_field="plugin_id")

    class Meta(BaseModel.Meta):
        table = "internal_permissions"
        abstract = False


# Role -> Permission link (many-to-many).
class RolePermission(BaseModel):
    """Internal model for role permissions."""

    role = fields.ForeignKeyField("models.Role", related_name="role_permissions", on_delete=fields.CASCADE)
    permission = fields.ForeignKeyField("models.Permission", related_name="permission_roles", on_delete=fields.CASCADE)
    conditions = fields.JSONField(default=list)

    class Meta(BaseModel.Meta):
        table = "internal_role_permissions"
        unique_together = (("role_id", "permission_id"),)
        abstract = False
