from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.knowledge._enums import (
    KnowledgeServingFreshness,
    KnowledgeSourceKind,
    KnowledgeSourceStatus,
)


class KnowledgeSourceRecord(BaseModel):
    knowledge_base = fields.ForeignKeyField(
        "models.KnowledgeBaseRecord",
        related_name="sources",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    source_kind = fields.CharEnumField(KnowledgeSourceKind, max_length=32, db_index=True)
    display_name = fields.CharField(max_length=160)
    locale = fields.CharField(max_length=32, db_index=True)
    status = fields.CharEnumField(
        KnowledgeSourceStatus,
        max_length=16,
        default=KnowledgeSourceStatus.PENDING,
        db_index=True,
    )
    locator = fields.JSONField()
    refresh_schedule_policy = fields.JSONField(null=True)
    upstream_fingerprint = fields.CharField(max_length=128, null=True)
    active_ready_version_id = fields.UUIDField(null=True, db_index=True)
    latest_candidate_version_id = fields.UUIDField(null=True, db_index=True)
    last_attempted_at = fields.DatetimeField(null=True)
    last_succeeded_at = fields.DatetimeField(null=True)
    last_failed_at = fields.DatetimeField(null=True)
    safe_error_code = fields.CharField(max_length=128, null=True)
    serving_freshness = fields.CharEnumField(
        KnowledgeServingFreshness,
        max_length=16,
        default=KnowledgeServingFreshness.CURRENT,
    )
    metadata_revision = fields.IntField(default=1)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    deletion_requested_at = fields.DatetimeField(null=True)
    deletion_requested_by_user_id = fields.UUIDField(null=True)

    if TYPE_CHECKING:
        knowledge_base_id: UUID

    class Meta(BaseModel.Meta):
        table = "knowledge_sources"
        table_description = "Workspace Knowledge source identities and serving state."
        abstract = False
        unique_together = (("workspace_id", "request_idempotency_key"),)
        indexes = (
            ("workspace_id", "knowledge_base_id", "status"),
            ("workspace_id", "source_kind", "updated_at"),
            ("workspace_id", "request_idempotency_key"),
        )
