from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class KnowledgeChunkRecord(BaseModel):
    source_version = fields.ForeignKeyField(
        "models.KnowledgeSourceVersionRecord",
        related_name="chunks",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    ordinal = fields.IntField()
    content_hash = fields.CharField(max_length=71, db_index=True)
    content_text = fields.TextField(null=True)
    content_reference = fields.JSONField(null=True)
    citation_location = fields.JSONField()
    token_count = fields.IntField()
    locale = fields.CharField(max_length=32, db_index=True)
    metadata = fields.JSONField(default=dict)
    upstream_acl_tags = fields.JSONField(default=list)
    embedding_reference = fields.JSONField(null=True)
    embedding_provider = fields.CharField(max_length=64, null=True)
    embedding_model = fields.CharField(max_length=128, null=True)
    embedding_version = fields.CharField(max_length=64, null=True)
    vector_dimensions = fields.IntField(null=True)
    prompt_injection_scan = fields.JSONField(default=dict)
    retrieval_eligible = fields.BooleanField(default=False, db_index=True)

    if TYPE_CHECKING:
        source_version_id: UUID

    class Meta(BaseModel.Meta):
        table = "knowledge_chunks"
        table_description = "Version-pinned Workspace Knowledge retrieval chunks."
        abstract = False
        unique_together = (("source_version_id", "ordinal"),)
        indexes = (("workspace_id", "source_version_id", "retrieval_eligible"),)
