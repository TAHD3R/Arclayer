"""AI budget models — unified currency unit cost_micros (microdollars).

R3 audit requirement: all monetary values use cost_micros (1 dollar = 1,000,000 µ$).
Budget operations are atomic via single-statement UPDATE...RETURNING.
Reservation state machine is status-guarded with idempotent terminal paths.
"""

from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class BudgetSourceType(StrEnum):
    WORKSPACE = "workspace"
    USER = "user"
    PLATFORM = "platform"


class AIBudget(BaseModel):
    """Per-funding-source monthly budget envelope.

    Uses cost_micros (microdollars) as the unified currency unit.
    All three counters (limit, spent, reserved) are in the same unit.
    """

    source_type = fields.CharEnumField(BudgetSourceType, db_index=True)
    source_id = fields.UUIDField(db_index=True)
    limit_micros = fields.BigIntField()  # Monthly cap in microdollars
    spent_micros = fields.BigIntField(default=0)  # Confirmed spent
    reserved_micros = fields.BigIntField(default=0)  # Active reservations
    period_start = fields.DateField()

    class Meta(BaseModel.Meta):
        table = "ai_budgets"
        table_description = "Per-funding-source monthly budget envelope records."
        abstract = False
        unique_together = (("source_type", "source_id", "period_start"),)
