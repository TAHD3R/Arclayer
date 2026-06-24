from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.content._enums import ContentPresentationKind


class PresentationDocumentRecord(BaseModel):
    """Domain model for presentation document records."""

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
        table_description = "Presentation-layer document records per content version."
        abstract = False
        unique_together = (("version_id", "kind"),)
