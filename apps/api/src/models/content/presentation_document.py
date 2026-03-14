from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from apps.api.src.common.models.base import BaseModel
from apps.api.src.models.content._enums import ContentPresentationKind


class PresentationDocumentRecord(BaseModel):
    """Version-scoped presentation payload (visual, rich text, query DSL, etc.)."""

    version = fields.ForeignKeyField(
        "models.ContentVersionRecord",
        related_name="presentation_documents",
        on_delete=fields.CASCADE,
    )

    kind = fields.CharEnumField(ContentPresentationKind, max_length=32, db_index=True)
    payload = fields.JSONField(null=True)

    if TYPE_CHECKING:
        version_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_presentation_documents"
        abstract = False
        unique_together = (("version_id", "kind"),)
