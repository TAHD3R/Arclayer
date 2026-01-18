from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class Role(BaseModel):
    code = fields.CharField(max_length=64, unique=True, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)
    is_default = fields.BooleanField(default=False, db_index=True)
    is_superuser = fields.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        table = "roles"
        abstract = False


class Permission(BaseModel):
    code = fields.CharField(max_length=128, unique=True, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)
    plugin_id = fields.CharField(max_length=128, null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "permissions"
        abstract = False


class RolePermission(BaseModel):
    role = fields.ForeignKeyField("models.Role", related_name="role_permissions", on_delete=fields.CASCADE)
    permission = fields.ForeignKeyField("models.Permission", related_name="permission_roles", on_delete=fields.CASCADE)

    class Meta(BaseModel.Meta):
        table = "role_permissions"
        unique_together = ("role_id", "permission_id")
        abstract = False


class UserRole(BaseModel):
    user = fields.ForeignKeyField("models.User", related_name="user_roles", on_delete=fields.CASCADE)
    role = fields.ForeignKeyField("models.Role", related_name="role_users", on_delete=fields.CASCADE)

    class Meta(BaseModel.Meta):
        table = "user_roles"
        unique_together = ("user_id", "role_id")
        abstract = False
