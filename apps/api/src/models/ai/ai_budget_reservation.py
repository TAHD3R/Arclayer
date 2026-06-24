"""AI budget reservation — atomic, idempotent, status-guarded.

R3 audit requirements:
    - Reservation creation uses a single UPDATE...RETURNING transaction.
    - Status transitions are guarded (only 'reserved' → committed/released/expired).
    - Terminal states (committed, released, expired) are idempotent.
"""

from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class ReservationStatus(StrEnum):
    RESERVED = "reserved"  # Active hold on budget
    COMMITTED = "committed"  # Finalized after LLM response
    RELEASED = "released"  # Explicitly returned (error/cancel)
    EXPIRED = "expired"  # TTL sweep by cron


class AIBudgetReservation(BaseModel):
    """Per-request budget hold record.

    Each LLM call creates a reservation before the call, then commits or releases
    it after receiving the actual token usage from LiteLLM.
    """

    budget = fields.ForeignKeyField(
        "models.AIBudget",
        related_name="reservations",
        on_delete=fields.CASCADE,
    )
    request_id = fields.UUIDField(unique=True, db_index=True)
    estimated_cost_micros = fields.BigIntField()  # Pre-call estimate
    reserved_cost_micros = fields.BigIntField()  # Amount actually reserved
    actual_cost_micros = fields.BigIntField(null=True)  # Post-call actual (only when committed)
    status = fields.CharEnumField(ReservationStatus, default=ReservationStatus.RESERVED, db_index=True)
    expires_at = fields.DatetimeField()

    class Meta(BaseModel.Meta):
        table = "ai_budget_reservations"
        table_description = "Per-request budget hold reservation records."
        abstract = False
