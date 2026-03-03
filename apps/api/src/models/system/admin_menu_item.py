from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class AdminMenuItemType(StrEnum):
    GROUP = "group"
    ITEM = "item"


# Admin menu item for dynamic routing.
class AdminMenuItem(BaseModel):
    """
    Admin menu item stored in DB for dynamic routing.

    - code is immutable and should be treated as a stable identifier.
    - deleted_at enables soft delete (keeps history for audit/rollback).
    """

    code = fields.CharField(max_length=64, unique=True, db_index=True)
    parent = fields.ForeignKeyField(
        "models.AdminMenuItem",
        related_name="children",
        null=True,
        on_delete=fields.SET_NULL,
    )
    title = fields.CharField(max_length=128)
    title_i18n = fields.CharField(max_length=128, null=True)
    icon = fields.CharField(max_length=64, null=True)
    type = fields.CharEnumField(AdminMenuItemType, default=AdminMenuItemType.ITEM, db_index=True)

    path = fields.CharField(max_length=256, null=True)
    name = fields.CharField(max_length=128, null=True, db_index=True)
    component_key = fields.CharField(max_length=128, null=True)
    redirect = fields.CharField(max_length=256, null=True)

    sort = fields.IntField(default=0, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    permission_code = fields.CharField(max_length=128, null=True, db_index=True)
    meta = fields.JSONField(null=True)

    deleted_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "admin_menu_items"
        abstract = False
