from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.http.pagination import PageParams
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


@pytest.mark.asyncio
async def test_http_request_groups_are_filtered_parameterized_and_paginated() -> None:
    service = ObservabilityService(_settings())
    connection = MagicMock()
    connection.execute_query_dict = AsyncMock(
        side_effect=[
            [{"total": 3}],
            [
                {
                    "route_template": "/api/v1/projects/{project_id}",
                    "method": "GET",
                    "status_class": 2,
                    "requests": 20,
                    "error_requests": 2,
                    "duration_total_ms": 1_000,
                    "max_latency_ms": 120,
                    "p95_latency_ms": Decimal("90.5"),
                    "p99_latency_ms": Decimal("115.25"),
                    "last_seen_at": datetime(2026, 7, 13, 1, tzinfo=UTC),
                }
            ],
        ]
    )
    registry = MagicMock()
    registry.get.return_value = connection

    with (
        patch("src.modules.observability.service.connections", registry),
        patch.object(service, "resolve_scope", new=AsyncMock(return_value=(None, None))),
        patch("src.modules.observability.service._period") as period,
    ):
        period.return_value = (
            datetime(2026, 7, 1, tzinfo=UTC),
            datetime(2026, 7, 14, tzinfo=UTC),
            ObservabilityPeriodOut(
                start_date=date(2026, 7, 1),
                end_date=date(2026, 7, 13),
                days=13,
            ),
        )
        result = await service.list_http_request_groups(
            days=13,
            params=PageParams(page=1, size=1),
            route_query="projects",
            method="get",
            status_class=2,
            workspace_id=None,
            project_id=None,
        )

    assert result.total == 3
    assert result.pages == 3
    assert result.next == 2
    assert len(result.items) == 1
    assert result.items[0].requests == 20
    assert result.items[0].error_rate == 0.1
    assert result.items[0].avg_latency_ms == 50
    assert result.items[0].p95_latency_ms == 90.5
    assert result.items[0].p99_latency_ms == 115.25
    count_call, page_call = connection.execute_query_dict.await_args_list
    assert "m.route_template ILIKE $3" in count_call.args[0]
    assert "m.method = $4" in count_call.args[0]
    assert "m.status_class = $5" in count_call.args[0]
    assert count_call.args[1] == [
        datetime(2026, 7, 1, tzinfo=UTC),
        datetime(2026, 7, 14, tzinfo=UTC),
        "%projects%",
        "GET",
        2,
    ]
    assert "LIMIT $6 OFFSET $7" in page_call.args[0]
    assert "PERCENTILE_CONT(0.95)" in page_call.args[0]
    assert page_call.args[1][-2:] == [1, 0]


@pytest.mark.asyncio
async def test_http_summary_calculates_tail_latency_from_request_facts() -> None:
    service = ObservabilityService(_settings())
    connection = MagicMock()
    connection.execute_query_dict = AsyncMock(
        return_value=[
            {
                "requests": 4,
                "error_requests": 1,
                "duration_total_ms": 200,
                "duration_max_ms": 120,
                "p95_latency_ms": Decimal("110.5"),
                "p99_latency_ms": Decimal("118.1"),
            }
        ]
    )
    registry = MagicMock()
    registry.get.return_value = connection

    with patch("src.modules.observability.service.connections", registry):
        result = await service._http_summary(
            start=datetime(2026, 7, 1, tzinfo=UTC),
            end=datetime(2026, 7, 2, tzinfo=UTC),
            workspace_id=None,
            project_id=None,
        )

    assert result.avg_latency_ms == 50
    assert result.p95_latency_ms == 110.5
    assert result.p99_latency_ms == 118.1
    assert connection.execute_query_dict.await_args is not None
    sql = connection.execute_query_dict.await_args.args[0]
    assert "observability_http_request_records" in sql
    assert "PERCENTILE_CONT(0.99)" in sql


@pytest.mark.asyncio
async def test_http_request_records_include_actor_and_support_trace_search() -> None:
    service = ObservabilityService(_settings())
    actor_id = uuid4()
    record_id = uuid4()
    connection = MagicMock()
    connection.execute_query_dict = AsyncMock(
        side_effect=[
            [{"total": 1}],
            [
                {
                    "id": record_id,
                    "occurred_at": datetime(2026, 7, 13, 1, tzinfo=UTC),
                    "trace_id": "trace-1",
                    "actor_user_id": actor_id,
                    "actor_username": "alex",
                    "actor_display_name": "Alex",
                    "actor_avatar_url": "/avatar.png",
                    "workspace_id": None,
                    "project_id": None,
                    "route_template": "/api/v1/projects/{project_id}",
                    "method": "PATCH",
                    "status_code": 503,
                    "duration_ms": 88,
                }
            ],
        ]
    )
    registry = MagicMock()
    registry.get.return_value = connection

    with (
        patch("src.modules.observability.service.connections", registry),
        patch.object(service, "resolve_scope", new=AsyncMock(return_value=(None, None))),
        patch("src.modules.observability.service._period") as period,
    ):
        period.return_value = (
            datetime(2026, 7, 1, tzinfo=UTC),
            datetime(2026, 7, 14, tzinfo=UTC),
            ObservabilityPeriodOut(
                start_date=date(2026, 7, 1),
                end_date=date(2026, 7, 13),
                days=13,
            ),
        )
        result = await service.list_http_request_records(
            days=13,
            params=PageParams(page=1, size=20),
            query="trace-1",
            method="patch",
            status_class=5,
            workspace_id=None,
            project_id=None,
        )

    assert result.total == 1
    assert result.items[0].id == record_id
    assert result.items[0].actor is not None
    assert result.items[0].actor.display_name == "Alex"
    count_call, page_call = connection.execute_query_dict.await_args_list
    assert "r.trace_id ILIKE $3" in count_call.args[0]
    assert "r.method = $4" in count_call.args[0]
    assert "r.status_code / 100" in count_call.args[0]
    assert "LEFT JOIN users" in page_call.args[0]


@pytest.mark.asyncio
async def test_ai_usage_groups_are_real_parameterized_aggregates() -> None:
    service = ObservabilityService(_settings())
    connection = MagicMock()
    connection.execute_query_dict = AsyncMock(
        side_effect=[
            [{"total": 1}],
            [
                {
                    "provider": "openai",
                    "model": "gpt-5",
                    "requests": 10,
                    "error_requests": 1,
                    "prompt_tokens": 1_200,
                    "completion_tokens": 800,
                    "cost_micros": 3_000_000,
                    "avg_latency_ms": Decimal("248.75"),
                    "last_seen_at": datetime(2026, 7, 13, 1, tzinfo=UTC),
                }
            ],
        ]
    )
    registry = MagicMock()
    registry.get.return_value = connection

    with (
        patch("src.modules.observability.service.connections", registry),
        patch.object(service, "resolve_scope", new=AsyncMock(return_value=(None, None))),
        patch("src.modules.observability.service._period") as period,
    ):
        period.return_value = (
            datetime(2026, 7, 1, tzinfo=UTC),
            datetime(2026, 7, 14, tzinfo=UTC),
            ObservabilityPeriodOut(
                start_date=date(2026, 7, 1),
                end_date=date(2026, 7, 13),
                days=13,
            ),
        )
        result = await service.list_ai_usage_groups(
            days=13,
            params=PageParams(page=1, size=20),
            query="gpt",
            provider="openai",
            workspace_id=None,
            project_id=None,
        )

    assert result.total == 1
    assert result.items[0].total_tokens == 2_000
    assert result.items[0].error_rate == 0.1
    assert result.items[0].avg_latency_ms == 248.75
    count_call, page_call = connection.execute_query_dict.await_args_list
    assert "a.provider ILIKE $3 OR a.model ILIKE $3" in count_call.args[0]
    assert "a.provider = $4" in count_call.args[0]
    assert count_call.args[1][-2:] == ["%gpt%", "openai"]
    assert "LIMIT $5 OFFSET $6" in page_call.args[0]
