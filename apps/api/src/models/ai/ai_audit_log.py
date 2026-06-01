"""AI audit log — append-only record of all AI API calls.

R3 audit requirement:
    - Every LLM call is logged before execution.
    - Final status is updated after the call completes.
    - No FK constraints — logs are append-only and never purged via cascade.
"""

from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class AuditLogSource(StrEnum):
    AGENT = "agent"
    EVENT = "event"
    API = "api"


class AuditLogStatus(StrEnum):
    SUCCESS = "success"
    ERROR = "error"
    RATE_LIMITED = "rate_limited"
    CANCELLED = "cancelled"


class AIAuditLog(BaseModel):
    """Append-only audit log for AI API calls."""

    correlation_id = fields.UUIDField(db_index=True)
    workspace_id = fields.UUIDField(null=True, db_index=True)
    user_id = fields.UUIDField(null=True, db_index=True)
    source = fields.CharEnumField(AuditLogSource, db_index=True)
    provider = fields.CharField(max_length=50)
    model = fields.CharField(max_length=100)
    request_type = fields.CharField(max_length=20)
    prompt_tokens = fields.BigIntField()
    completion_tokens = fields.BigIntField()
    cost_micros = fields.BigIntField()
    duration_ms = fields.IntField(null=True)
    status = fields.CharEnumField(AuditLogStatus, db_index=True)
    error_code = fields.CharField(max_length=50, null=True)
    error_message = fields.TextField(null=True)

    class Meta(BaseModel.Meta):
        table = "ai_audit_log"
        abstract = False
