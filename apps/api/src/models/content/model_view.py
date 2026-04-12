from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel
from src.models.content._enums import ContentModelViewType


class ContentModelViewRecord(BaseModel):
    """View DSL contract under a rebuilt content model."""

    model_definition = fields.ForeignKeyField(
        "models.ContentModelDefinitionRecord",
        related_name="views",
        on_delete=fields.CASCADE,
    )

    key = fields.CharField(max_length=64, db_index=True)
    label = fields.CharField(max_length=128)
    view_type = fields.CharEnumField(ContentModelViewType, max_length=32, db_index=True)
    dsl = fields.JSONField(null=True)
    is_enabled = fields.BooleanField(default=True, db_index=True)
    sort_order = fields.IntField(default=0)

    if TYPE_CHECKING:
        model_definition_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_model_views"
        abstract = False
        unique_together = (("model_definition_id", "key"),)
