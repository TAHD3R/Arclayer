from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class PositionRole(BaseModel):
    position = fields.ForeignKeyField(
        "models.Position",
        related_name="rbac_org_role_links",
        on_delete=fields.CASCADE,
    )
    role = fields.ForeignKeyField(
        "models.Role",
        related_name="rbac_org_position_roles",
        on_delete=fields.CASCADE,
    )

    class Meta(BaseModel.Meta):
        table = "rbac_org_position_roles"
        unique_together = ("position_id", "role_id")
        abstract = False


class DepartmentRole(BaseModel):
    department = fields.ForeignKeyField(
        "models.Department",
        related_name="rbac_org_role_links",
        on_delete=fields.CASCADE,
    )
    role = fields.ForeignKeyField(
        "models.Role",
        related_name="rbac_org_department_roles",
        on_delete=fields.CASCADE,
    )

    class Meta(BaseModel.Meta):
        table = "rbac_org_department_roles"
        unique_together = ("department_id", "role_id")
        abstract = False
