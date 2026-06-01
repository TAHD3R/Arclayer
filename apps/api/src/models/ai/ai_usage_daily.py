"""AI usage daily rollup — aggregated per-workspace daily usage.

R3 audit requirement:
    - Daily rollups for billing and quota enforcement.
    - Unique constraint on (workspace_id, date, source_type, provider, model).
"""

from __future__ import annotations

from tortoise import fields

from src.common.models.base import BaseModel
from src.models.ai.ai_budget import BudgetSourceType


class AIUsageDaily(BaseModel):
    """Daily aggregated AI usage statistics."""

    workspace_id = fields.UUIDField(db_index=True)
    date = fields.DateField()
    source_type = fields.CharEnumField(BudgetSourceType, db_index=True)
    provider = fields.CharField(max_length=50)
    model = fields.CharField(max_length=100)
    request_count = fields.IntField(default=0)
    prompt_tokens = fields.BigIntField(default=0)
    completion_tokens = fields.BigIntField(default=0)
    cost_micros = fields.BigIntField(default=0)

    class Meta(BaseModel.Meta):
        table = "ai_usage_daily"
        abstract = False
        unique_together = (("workspace_id", "date", "source_type", "provider", "model"),)
