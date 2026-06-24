from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class ComponentBindingRecord(BaseModel):
    """Domain model for component binding records."""

    version = fields.ForeignKeyField(
        "models.ContentVersionRecord",
        related_name="component_bindings",
        on_delete=fields.CASCADE,
    )
    component_key = fields.CharField(max_length=128, db_index=True)
    binding_key = fields.CharField(max_length=128, db_index=True)
    binding_payload = fields.JSONField(null=True)
    sort_order = fields.IntField(default=0)

    if TYPE_CHECKING:
        version_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_component_bindings"
        table_description = "Component-to-content-version binding records."
        abstract = False
        unique_together = (("version_id", "component_key", "binding_key"),)
