from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class OperationalSignalTriageState(StrEnum):
    UNCLAIMED = "unclaimed"
    IN_PROGRESS = "in_progress"
    WAITING = "waiting"
    SOURCE_RECOVERED = "source_recovered"


class OperationalSignalTriageAction(StrEnum):
    CLAIM = "claim"
    ASSIGN = "assign"
    TRANSFER = "transfer"
    IN_PROGRESS = "in_progress"
    REMIND_LATER = "remind_later"
    NEEDS_ATTENTION = "needs_attention"
    REMINDER_RETURNED = "reminder_returned"
    NOTE_ADDED = "note_added"


class OperationalSignalProjectionSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class OperationalSignalProjectionLifecycle(StrEnum):
    UNRESOLVED = "unresolved"
    RESOLVED = "resolved"


class OperationalSignalProjection(BaseModel):
    """Source-domain owned condition projected for Needs attention consumption."""

    source_domain = fields.CharField(max_length=64)
    signal_type = fields.CharField(max_length=128)
    source_reference_type = fields.CharField(max_length=96)
    source_reference_id = fields.UUIDField()
    severity = fields.CharEnumField(OperationalSignalProjectionSeverity, max_length=16, db_index=True)
    detected_at = fields.DatetimeField(db_index=True)
    source_observed_at = fields.DatetimeField()
    priority_rank = fields.IntField(db_index=True)
    priority_reason_keys = fields.JSONField(default=list)
    title_key = fields.CharField(max_length=192)
    explanation_key = fields.CharField(max_length=192)
    impact_key = fields.CharField(max_length=192)
    sanitized_evidence = fields.JSONField(default=dict)
    required_permission = fields.CharField(max_length=128)
    destination_target = fields.CharField(max_length=192)
    affected_scope = fields.JSONField(default=dict)
    workspace_id = fields.UUIDField(null=True, db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    site_id = fields.UUIDField(null=True, db_index=True)
    source_lifecycle = fields.CharEnumField(
        OperationalSignalProjectionLifecycle,
        max_length=16,
        default=OperationalSignalProjectionLifecycle.UNRESOLVED,
        db_index=True,
    )
    resolution_condition_key = fields.CharField(max_length=192)
    resolved_at = fields.DatetimeField(null=True)
    policy_id = fields.CharField(max_length=128)
    policy_revision = fields.IntField()

    class Meta(BaseModel.Meta):
        table = "operational_signal_projections"
        table_description = "Source-domain owned Operational Signal projection records."
        abstract = False
        unique_together = (("source_domain", "signal_type", "source_reference_type", "source_reference_id"),)
        indexes = (
            ("source_lifecycle", "priority_rank", "detected_at"),
            ("source_domain", "source_lifecycle", "detected_at"),
            ("workspace_id", "source_lifecycle"),
            ("project_id", "source_lifecycle"),
            ("site_id", "source_lifecycle"),
        )


class OperationalSignalTriage(BaseModel):
    """Current coordination state for one source-owned Operational Signal."""

    projection = fields.OneToOneField(
        "models.OperationalSignalProjection",
        related_name="triage",
        on_delete=fields.RESTRICT,
    )
    state = fields.CharEnumField(
        OperationalSignalTriageState,
        default=OperationalSignalTriageState.UNCLAIMED,
        db_index=True,
    )
    assignee_user_id = fields.UUIDField(null=True, db_index=True)
    reminder_at = fields.DatetimeField(null=True, db_index=True)
    reminder_reason = fields.TextField(null=True)
    revision = fields.BigIntField(default=1)
    last_actor_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        projection_id: UUID

    class Meta(BaseModel.Meta):
        table = "operational_signal_triage"
        table_description = "Revisioned current triage state without copied source lifecycle."
        abstract = False
        indexes = (("state", "reminder_at"), ("assignee_user_id", "state"))


class OperationalSignalTriageHistory(BaseModel):
    """Immutable attribution history for Operational Signal triage commands."""

    triage = fields.ForeignKeyField(
        "models.OperationalSignalTriage",
        related_name="history",
        on_delete=fields.CASCADE,
    )
    revision = fields.BigIntField()
    action = fields.CharEnumField(OperationalSignalTriageAction, max_length=32, db_index=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    from_state = fields.CharEnumField(OperationalSignalTriageState, null=True)
    to_state = fields.CharEnumField(OperationalSignalTriageState)
    from_assignee_user_id = fields.UUIDField(null=True)
    to_assignee_user_id = fields.UUIDField(null=True)
    reminder_at = fields.DatetimeField(null=True)
    reminder_reason = fields.TextField(null=True)

    if TYPE_CHECKING:
        triage_id: UUID

    class Meta(BaseModel.Meta):
        table = "operational_signal_triage_history"
        table_description = "Append-only Operational Signal triage history."
        abstract = False
        unique_together = (("triage_id", "revision"),)
        indexes = (("triage_id", "created_at"),)


class OperationalSignalTriageNote(BaseModel):
    """Immutable operator-authored coordination note for one Operational Signal."""

    triage = fields.ForeignKeyField(
        "models.OperationalSignalTriage",
        related_name="notes",
        on_delete=fields.CASCADE,
    )
    revision = fields.BigIntField()
    actor_user_id = fields.UUIDField(db_index=True)
    body = fields.TextField()

    if TYPE_CHECKING:
        triage_id: UUID

    class Meta(BaseModel.Meta):
        table = "operational_signal_triage_notes"
        table_description = "Append-only operator notes for Operational Signal triage."
        abstract = False
        unique_together = (("triage_id", "revision"),)
        indexes = (("triage_id", "created_at"),)
