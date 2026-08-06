"""Deployment-wide immutable AI policy revisions."""

from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class GlobalAiPolicyRevisionStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    RETIRED = "retired"


class GlobalAiPolicyRevision(BaseModel):
    """One deployment-wide policy revision; published rows are immutable."""

    sequence = fields.IntField()
    status = fields.CharEnumField(
        GlobalAiPolicyRevisionStatus, default=GlobalAiPolicyRevisionStatus.DRAFT, db_index=True
    )
    allowed_models = fields.JSONField(default=list)
    default_model = fields.CharField(max_length=255, null=True)
    max_tokens_per_request = fields.IntField(default=0)
    max_cost_micros_per_request = fields.BigIntField(default=0)
    max_concurrent_runs = fields.IntField(default=0)
    external_data_egress_allowed = fields.BooleanField(default=False)
    tool_allowlist = fields.JSONField(default=list)
    approval_required_effect_classes = fields.JSONField(default=list)
    retry_limit = fields.IntField(default=0)
    retention_days = fields.IntField(default=0)
    content_hash = fields.CharField(max_length=64, unique=True)
    published_at = fields.DatetimeField(null=True, db_index=True)
    applied_at = fields.DatetimeField(null=True)
    applied_idempotency_key_hash = fields.CharField(max_length=64, null=True)
    applied_request_fingerprint = fields.CharField(max_length=64, null=True)

    class Meta(BaseModel.Meta):
        table = "ai_global_policy_revisions"
        table_description = "Immutable deployment-wide AI policy revisions."
        abstract = False
        unique_together = (("sequence", "status"),)
        indexes = (("status", "sequence"),)
