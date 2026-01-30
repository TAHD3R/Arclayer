from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from tortoise import fields

from apps.api.models.base import BaseModel


class SettingRecord(BaseModel):
    """Runtime settings store (namespace -> JSON value)."""

    namespace = fields.CharField(max_length=128, unique=True, db_index=True)
    value = fields.JSONField(null=True)
    updated_by = fields.UUIDField(null=True)

    if TYPE_CHECKING:
        namespace: str
        value: dict[str, Any] | None
        updated_by: UUID | None

    class Meta(BaseModel.Meta):
        table = "settings"
        abstract = False
