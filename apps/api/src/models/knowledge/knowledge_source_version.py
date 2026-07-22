from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.knowledge._enums import KnowledgeIngestionMode, KnowledgeVersionStatus


class KnowledgeSourceVersionRecord(BaseModel):
    source = fields.ForeignKeyField(
        "models.KnowledgeSourceRecord",
        related_name="versions",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    version_number = fields.IntField()
    content_hash = fields.CharField(max_length=71, db_index=True)
    normalized_content_hash = fields.CharField(max_length=71, db_index=True)
    content_text = fields.TextField(null=True)
    parser_name = fields.CharField(max_length=64)
    parser_version = fields.CharField(max_length=32)
    ingestion_mode = fields.CharEnumField(KnowledgeIngestionMode, max_length=16)
    fetch_provenance = fields.JSONField(default=dict)
    locale = fields.CharField(max_length=32, db_index=True)
    title = fields.CharField(max_length=256, null=True)
    document_metadata = fields.JSONField(default=dict)
    embedding_provider = fields.CharField(max_length=64, null=True)
    embedding_model = fields.CharField(max_length=128, null=True)
    embedding_version = fields.CharField(max_length=64, null=True)
    vector_dimensions = fields.IntField(null=True)
    chunker_name = fields.CharField(max_length=64)
    chunker_version = fields.CharField(max_length=32)
    index_schema_version = fields.IntField(default=1)
    token_count = fields.IntField(null=True)
    character_count = fields.IntField(null=True)
    chunk_count = fields.IntField(null=True)
    provenance_actor_user_id = fields.UUIDField(null=True, db_index=True)
    provenance_job_id = fields.UUIDField(null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        source_id: UUID
        operational_state: KnowledgeSourceVersionStateRecord

    class Meta(BaseModel.Meta):
        table = "knowledge_source_versions"
        table_description = "Immutable Workspace Knowledge source-version content and provenance."
        abstract = False
        unique_together = (
            ("source_id", "version_number"),
            ("source_id", "request_idempotency_key"),
        )
        indexes = (("workspace_id", "source_id", "created_at"),)


class KnowledgeSourceVersionStateRecord(BaseModel):
    source_version = fields.OneToOneField(
        "models.KnowledgeSourceVersionRecord",
        related_name="operational_state",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    status = fields.CharEnumField(
        KnowledgeVersionStatus,
        max_length=16,
        default=KnowledgeVersionStatus.PENDING,
        db_index=True,
    )
    progress_stage = fields.CharField(max_length=64, null=True)
    safe_error_code = fields.CharField(max_length=128, null=True)
    safe_error_detail = fields.CharField(max_length=1000, null=True)
    index_job_id = fields.UUIDField(null=True, db_index=True)
    state_revision = fields.IntField(default=1)

    class Meta(BaseModel.Meta):
        table = "knowledge_source_version_states"
        table_description = "Mutable operational state for immutable Knowledge source versions."
        abstract = False
        indexes = (("workspace_id", "status", "updated_at"),)
