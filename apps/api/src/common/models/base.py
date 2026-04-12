from __future__ import annotations

from tortoise import fields, models

from src.common.utils.ids import uuid7


class BaseModel(models.Model):
    """Base Tortoise model (UUID primary key + timestamps)."""

    id = fields.UUIDField(primary_key=True, default=uuid7)
    created_at = fields.DatetimeField(auto_now_add=True, db_index=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta(models.Model.Meta):
        abstract = True
