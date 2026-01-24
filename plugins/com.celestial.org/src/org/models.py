from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class Department(BaseModel):
    code = fields.CharField(max_length=64, null=True, unique=True, db_index=True)
    name = fields.CharField(max_length=128)
    parent = fields.ForeignKeyField(
        "models.Department",
        related_name="children",
        null=True,
        on_delete=fields.SET_NULL,
    )
    sort = fields.IntField(default=0, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    description = fields.TextField(null=True)

    class Meta(BaseModel.Meta):
        table = "org_departments"
        abstract = False


class Position(BaseModel):
    code = fields.CharField(max_length=64, unique=True, db_index=True)
    name = fields.CharField(max_length=128)
    sort = fields.IntField(default=0, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    description = fields.TextField(null=True)

    class Meta(BaseModel.Meta):
        table = "org_positions"
        abstract = False


class UserDepartment(BaseModel):
    user = fields.ForeignKeyField("models.User", related_name="org_departments", on_delete=fields.CASCADE)
    department = fields.ForeignKeyField("models.Department", related_name="org_users", on_delete=fields.CASCADE)
    is_primary = fields.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        table = "org_user_departments"
        unique_together = ("user_id", "department_id")
        abstract = False


class UserPosition(BaseModel):
    user = fields.ForeignKeyField("models.User", related_name="org_positions", on_delete=fields.CASCADE)
    position = fields.ForeignKeyField("models.Position", related_name="org_users", on_delete=fields.CASCADE)

    class Meta(BaseModel.Meta):
        table = "org_user_positions"
        unique_together = ("user_id", "position_id")
        abstract = False
