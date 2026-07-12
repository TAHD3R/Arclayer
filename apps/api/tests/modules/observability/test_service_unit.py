from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import BadRequest
from src.modules.observability.schema import ObservabilityPeriodOut, ObservabilityTrendMetric
from src.modules.observability.service import ObservabilityService


def _settings(*, max_query_days: int = 365) -> Settings:
    return Settings(
        app_env="test",
        observability={"retention_days": 365, "max_query_days": max_query_days},
    )


def test_observability_rejects_ranges_beyond_configured_retention_window() -> None:
    service = ObservabilityService(_settings(max_query_days=90))

    with pytest.raises(BadRequest) as exc_info:
        service._validate_days(91)

    assert exc_info.value.error == "OBSERVABILITY_RANGE_EXCEEDED"


@pytest.mark.asyncio
async def test_empty_trend_returns_empty_points_and_zero_total_without_fabricated_samples() -> None:
    service = ObservabilityService(_settings())

    with (
        patch.object(service, "resolve_scope", new=AsyncMock(return_value=(None, None))),
        patch.object(service, "_trend_rows", new=AsyncMock(return_value=[])),
    ):
        result = await service.trends(
            days=30,
            metric=ObservabilityTrendMetric.HTTP_REQUESTS,
            workspace_id=None,
            project_id=None,
        )

    assert result.points == []
    assert result.total == 0


@pytest.mark.asyncio
async def test_sparse_trend_preserves_only_persisted_daily_facts() -> None:
    service = ObservabilityService(_settings())
    rows = [
        {"date": date(2026, 7, 10), "value": 4},
        {"date": date(2026, 7, 12), "value": 7},
    ]

    with (
        patch.object(service, "resolve_scope", new=AsyncMock(return_value=(None, None))),
        patch.object(service, "_trend_rows", new=AsyncMock(return_value=rows)),
        patch("src.modules.observability.service._period") as period,
    ):
        period.return_value = (
            datetime(2026, 7, 10, tzinfo=UTC),
            datetime(2026, 7, 13, tzinfo=UTC),
            ObservabilityPeriodOut(
                start_date=date(2026, 7, 10),
                end_date=date(2026, 7, 12),
                days=3,
            ),
        )
        result = await service.trends(
            days=3,
            metric=ObservabilityTrendMetric.HTTP_REQUESTS,
            workspace_id=None,
            project_id=None,
        )

    assert [point.date for point in result.points] == [date(2026, 7, 10), date(2026, 7, 12)]
    assert result.total == 11


@pytest.mark.asyncio
async def test_audit_trend_applies_authorized_project_scope_to_persisted_events() -> None:
    service = ObservabilityService(_settings())
    workspace_id = uuid4()
    project_id = uuid4()
    connection = MagicMock()
    connection.execute_query_dict = AsyncMock(return_value=[])
    registry = MagicMock()
    registry.get.return_value = connection

    with patch("src.modules.observability.service.connections", registry):
        await service._trend_rows(
            metric=ObservabilityTrendMetric.AUDIT_EVENTS,
            start=datetime(2026, 7, 1, tzinfo=UTC),
            end=datetime(2026, 8, 1, tzinfo=UTC),
            workspace_id=workspace_id,
            project_id=project_id,
        )

    assert connection.execute_query_dict.await_args is not None
    sql, values = connection.execute_query_dict.await_args.args
    assert "a.project_id = $4" in sql
    assert values == [
        datetime(2026, 7, 1, tzinfo=UTC),
        datetime(2026, 8, 1, tzinfo=UTC),
        workspace_id,
        project_id,
    ]


@pytest.mark.asyncio
async def test_data_availability_reports_exact_project_attribution_coverage() -> None:
    service = ObservabilityService(_settings())
    connection = MagicMock()
    connection.execute_query_dict = AsyncMock(
        return_value=[
            {
                "http_total": 100,
                "http_attributed": 70,
                "ai_total": 20,
                "ai_attributed": 18,
                "audit_total": 10,
                "audit_attributed": 4,
            }
        ]
    )
    registry = MagicMock()
    registry.get.return_value = connection

    with patch("src.modules.observability.service.connections", registry):
        result = await service._data_availability(
            start=datetime(2026, 7, 1, tzinfo=UTC),
            end=datetime(2026, 8, 1, tzinfo=UTC),
            workspace_id=None,
        )

    assert result.http_project_attribution.coverage_rate == 0.7
    assert result.ai_project_attribution.coverage_rate == 0.9
    assert result.audit_project_attribution.coverage_rate == 0.4
