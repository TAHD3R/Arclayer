from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class OperationalSignalTriageState(StrEnum):
    NEEDS_ATTENTION = "needs_attention"
    IN_PROGRESS = "in_progress"
    REMIND_LATER = "remind_later"


class OperationalSignalTriageAction(StrEnum):
    CLAIM = "claim"
    ASSIGN = "assign"
    IN_PROGRESS = "in_progress"
    REMIND_LATER = "remind_later"
    NEEDS_ATTENTION = "needs_attention"
    REMINDER_RETURNED = "reminder_returned"


class OperationalSignalTriage(BaseModel):
    """Current coordination state for one source-owned Operational Signal."""

    signal_id = fields.UUIDField(unique=True, db_index=True)
    source_job = fields.OneToOneField(
        "models.BackgroundJobRecord",
        related_name="operational_signal_triage",
        on_delete=fields.RESTRICT,
    )
    state = fields.CharEnumField(
        OperationalSignalTriageState,
        default=OperationalSignalTriageState.NEEDS_ATTENTION,
        db_index=True,
    )
    assignee_user_id = fields.UUIDField(null=True, db_index=True)
    reminder_at = fields.DatetimeField(null=True, db_index=True)
    reminder_reason = fields.TextField(null=True)
    revision = fields.BigIntField(default=1)
    last_actor_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        source_job_id: UUID

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
