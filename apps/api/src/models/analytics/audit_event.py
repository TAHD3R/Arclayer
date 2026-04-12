from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Audit log event (append-only).
class AuditEvent(BaseModel):
    """Domain model for audit events.

    Audit log event (append-only).

    This table stores security-relevant and operationally useful events:
    - who did what, when, and where (org/workspace)
    - best-effort linking to request logs via trace_id
    - minimal non-sensitive properties for investigation
    """

    occurred_at = fields.DatetimeField(db_index=True)
    event_name = fields.CharField(max_length=128, db_index=True)

    organization_id = fields.UUIDField(null=True, db_index=True)
    workspace_id = fields.UUIDField(null=True, db_index=True)

    actor_user_id = fields.UUIDField(null=True, db_index=True)
    subject_user_id = fields.UUIDField(null=True, db_index=True)

    entity_type = fields.CharField(max_length=64, null=True, db_index=True)
    entity_id = fields.UUIDField(null=True, db_index=True)

    trace_id = fields.CharField(max_length=64, null=True, db_index=True)
    source = fields.CharField(max_length=32, null=True, db_index=True)

    properties = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "domain_analytics_audit_events"
        abstract = False
        indexes = (
            ("organization_id", "occurred_at"),
            ("workspace_id", "occurred_at"),
            ("actor_user_id", "occurred_at"),
            ("event_name", "occurred_at"),
            ("entity_type", "entity_id", "occurred_at"),
        )
