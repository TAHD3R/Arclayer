"""AI usage query endpoints — monthly summary and daily trends.

R3 audit requirement:
    - Workspace-scoped usage queries for billing visibility.
    - Role-based access via workspace context resolver.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from tortoise.functions import Sum

from src.common.schemas import BaseSchema
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.models.ai.ai_usage_daily import AIUsageDaily
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/usage",
    tags=["domain.ai.usage"],
)


# ── Response schemas ──────────────────────────────────────────────────


class UsageModelBreakdown(BaseSchema):
    """Per-model usage breakdown within a time period."""

    provider: str
    model: str
    request_count: int
    prompt_tokens: int
    completion_tokens: int
    cost_micros: int


class MonthlyUsageSummary(BaseSchema):
    """Aggregated AI usage for a given month."""

    total_cost_micros: int
    total_requests: int
    total_prompt_tokens: int
    total_completion_tokens: int
    period_start: date
    period_end: date
    by_model: list[UsageModelBreakdown]


class DailyUsageRecord(BaseSchema):
    """Single day of aggregated AI usage."""

    date: date
    cost_micros: int
    request_count: int
    prompt_tokens: int
    completion_tokens: int


# ── Endpoints ─────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=ResponseModel[MonthlyUsageSummary],
    summary="Monthly AI usage summary",
)
async def get_monthly_usage(
    period: str = Query(
        default=...,
        pattern=r"^\d{4}-\d{2}$",
        description="Target month in YYYY-MM format.",
    ),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[MonthlyUsageSummary]:
    """Return the aggregated AI usage for the specified month."""
    _validate_period_format(period)
    year, month = _parse_period(period)
    workspace_id = ctx.workspace_id

    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)

    # Per-model breakdown.
    records = (
        await cast(
            Any,
            AIUsageDaily.filter(workspace_id=workspace_id, date__gte=start_date, date__lt=end_date).values(
                "provider", "model"
            ),
        )
        .annotate(
            request_count=Sum("request_count"),
            prompt_tokens=Sum("prompt_tokens"),
            completion_tokens=Sum("completion_tokens"),
            cost_micros=Sum("cost_micros"),
        )
        .order_by("-cost_micros")
    )

    by_model = [
        UsageModelBreakdown(
            provider=r["provider"],
            model=r["model"],
            request_count=int(r["request_count"] or 0),
            prompt_tokens=int(r["prompt_tokens"] or 0),
            completion_tokens=int(r["completion_tokens"] or 0),
            cost_micros=int(r["cost_micros"] or 0),
        )
        for r in records
    ]

    total_cost_micros = sum(b.cost_micros for b in by_model)
    total_requests = sum(b.request_count for b in by_model)
    total_prompt_tokens = sum(b.prompt_tokens for b in by_model)
    total_completion_tokens = sum(b.completion_tokens for b in by_model)

    return ApiResponse.success(
        data=MonthlyUsageSummary(
            total_cost_micros=total_cost_micros,
            total_requests=total_requests,
            total_prompt_tokens=total_prompt_tokens,
            total_completion_tokens=total_completion_tokens,
            period_start=start_date,
            period_end=end_date - timedelta(days=1),
            by_model=by_model,
        ),
    )


@router.get(
    "/daily",
    response_model=ResponseModel[list[DailyUsageRecord]],
    summary="Daily AI usage trend",
)
async def get_daily_usage_trend(
    days: int = Query(
        default=30,
        ge=1,
        le=365,
        description="Number of days to include in the trend.",
    ),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[list[DailyUsageRecord]]:
    """Return daily usage records for the trailing N days."""
    workspace_id = ctx.workspace_id
    start_date = date.today() - timedelta(days=days - 1)

    records = await AIUsageDaily.filter(workspace_id=workspace_id, date__gte=start_date).order_by("date")

    data = [
        DailyUsageRecord(
            date=r.date,
            cost_micros=int(r.cost_micros),
            request_count=int(r.request_count),
            prompt_tokens=int(r.prompt_tokens),
            completion_tokens=int(r.completion_tokens),
        )
        for r in records
    ]

    return ApiResponse.success(data=data)


# ── Helpers ────────────────────────────────────────────────────────────


def _validate_period_format(period: str) -> None:
    """Validate the period string matches YYYY-MM before parsing."""
    parts = period.split("-")
    if len(parts) != 2:
        raise HTTPException(status_code=422, detail="Invalid period format, expected YYYY-MM")


def _parse_period(period: str) -> tuple[int, int]:
    """Parse a YYYY-MM string into (year, month)."""
    parts = period.split("-")
    try:
        year = int(parts[0])
        month = int(parts[1])
    except (ValueError, IndexError):
        raise HTTPException(status_code=422, detail="Invalid period format, expected YYYY-MM") from None
    if month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="Month must be between 1 and 12")
    return year, month
