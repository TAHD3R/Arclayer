from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class Role(BaseModel):
    """
    RBAC role.

    Notes:
    - `code` is the stable identifier (used by defaults and permission templates).
    - `is_superuser` means "has all permissions".
    """

    code = fields.CharField(max_length=64, unique=True, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)
    is_default = fields.BooleanField(default=False, db_index=True)
    is_superuser = fields.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        table = "roles"
        abstract = False


class Permission(BaseModel):
    """
    RBAC permission.

    Notes:
    - `code` is the stable identifier, typically namespaced (e.g. "admin:access").
    - `plugin_id` is used for traceability and grouping (core uses "core").
    """

    code = fields.CharField(max_length=128, unique=True, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)
    plugin_id = fields.CharField(max_length=128, null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "permissions"
        abstract = False


class RolePermission(BaseModel):
    """Role -> Permission link (many-to-many)."""

    role = fields.ForeignKeyField("models.Role", related_name="role_permissions", on_delete=fields.CASCADE)
    permission = fields.ForeignKeyField("models.Permission", related_name="permission_roles", on_delete=fields.CASCADE)

    class Meta(BaseModel.Meta):
        table = "role_permissions"
        unique_together = ("role_id", "permission_id")
        abstract = False


class BootstrapState(BaseModel):
    """
    One-time RBAC bootstrap marker.

    This is kept intentionally small so early-stage setup can safely mark the first admin.
    """

    key = fields.CharField(max_length=64, unique=True, db_index=True)
    done = fields.BooleanField(default=False, db_index=True)
    done_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "rbac_bootstrap_state"
        abstract = False
