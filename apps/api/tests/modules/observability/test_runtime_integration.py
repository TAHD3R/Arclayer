from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from structlog.contextvars import bind_contextvars

from src.common.utils.public_ids import encode_uuid
from src.core.events import events
from src.core.registry import create_platform_app
from src.models.ai.ai_audit_log import AIAuditLog, AuditLogSource, AuditLogStatus
from src.models.analytics.audit_event import AuditEvent
from src.models.observability.http_request_metric import HTTPRequestMetricHourly
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.observability.http_metrics import (
    HTTP_REQUEST_METRIC_EVENT,
    HTTPRequestRecordFact,
    record_http_request_metric,
)
from src.modules.observability.system_router import router as system_observability_router
from src.modules.platform_identity.http import get_current_platform_session

pytestmark = pytest.mark.integration


def _system_observability_app() -> FastAPI:
    app = FastAPI()
    app.include_router(system_observability_router, prefix="/platform-api/v1/observability")

    async def platform_owner_override():
        return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)

    app.dependency_overrides[get_current_platform_session] = platform_owner_override
    return app


async def _wait_for_metric(*, route_template: str, project_id: UUID) -> HTTPRequestMetricHourly:
    for _ in range(100):
        metric = await HTTPRequestMetricHourly.get_or_none(
            route_template=route_template,
            project_id=project_id,
        )
        if metric is not None:
            return metric
        await asyncio.sleep(0.01)
    raise AssertionError(f"HTTP metric was not persisted for route {route_template}")


async def _create_ai_audit(
    *,
    workspace_id: UUID | None,
    project_id: UUID | None,
    user_id: UUID,
    duration_ms: int,
    status: AuditLogStatus = AuditLogStatus.SUCCESS,
) -> None:
    await AIAuditLog.create(
        correlation_id=uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        user_id=user_id,
        source=AuditLogSource.API,
        provider="openai",
        model="gpt-4o-mini",
        request_type="chat",
        prompt_tokens=10,
        completion_tokens=5,
        cost_micros=1_500,
        duration_ms=duration_ms,
        status=status,
    )


@pytest.mark.asyncio
async def test_system_observability_api_executes_empty_postgres_queries(db_schema) -> None:
    _ = db_schema
    app = _system_observability_app()
    transport = ASGITransport(app=app, raise_app_exceptions=True)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        trend_response = await client.get(
            "/platform-api/v1/observability/trends",
            params={"days": 30, "metric": "httpRequests"},
        )
        request_groups_response = await client.get(
            "/platform-api/v1/observability/request-groups",
            params={"days": 30, "page": 1, "size": 20},
        )
        ai_usage_groups_response = await client.get(
            "/platform-api/v1/observability/ai-usage-groups",
            params={"days": 30, "page": 1, "size": 20},
        )

    assert trend_response.status_code == 200, trend_response.text
    trend = trend_response.json()["data"]
    assert trend["points"] == []
    assert trend["total"] == 0
    assert request_groups_response.status_code == 200, request_groups_response.text
    assert request_groups_response.json()["data"] == {
        "items": [],
        "total": 0,
        "page": 1,
        "size": 20,
        "pages": 0,
        "next": None,
        "prev": None,
    }
    assert ai_usage_groups_response.status_code == 200, ai_usage_groups_response.text
    assert ai_usage_groups_response.json()["data"] == {
        "items": [],
        "total": 0,
        "page": 1,
        "size": 20,
        "pages": 0,
        "next": None,
        "prev": None,
    }


@pytest.mark.asyncio
async def test_system_request_groups_execute_real_percentile_query(db_schema) -> None:
    _ = db_schema
    await record_http_request_metric(
        HTTPRequestRecordFact(
            trace_id="request-group-percentile",
            normalized_path="/api/v1/request-group-probe",
            route_template="/api/v1/request-group-probe",
            method="GET",
            protocol="HTTP/1.1",
            status_code=200,
            duration_ms=125,
            service_name="Arclayer API",
            ingestion_source="integration_test",
        )
    )
    app = _system_observability_app()
    transport = ASGITransport(app=app, raise_app_exceptions=True)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/platform-api/v1/observability/request-groups",
            params={"days": 1, "page": 1, "size": 20},
        )

    assert response.status_code == 200, response.text
    groups = response.json()["data"]
    assert groups["total"] == 1
    assert groups["items"] == [
        {
            "routeTemplate": "/api/v1/request-group-probe",
            "method": "GET",
            "statusClass": 2,
            "requests": 1,
            "errorRequests": 0,
            "errorRate": 0.0,
            "avgLatencyMs": 125.0,
            "p95LatencyMs": 125.0,
            "p99LatencyMs": 125.0,
            "maxLatencyMs": 125,
            "lastSeenAt": groups["items"][0]["lastSeenAt"],
        }
    ]


@pytest.mark.asyncio
async def test_lifespan_persists_real_request_and_project_filters_all_telemetry(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    app = create_platform_app()
    request_scope: dict[str, UUID] = {}
    current_user: User | None = None
    probe_template = "/platform-api/v1/observability-runtime-probe/{project_id}"

    @app.get(probe_template, tags=["test.observability.runtime"])
    async def observability_runtime_probe(project_id: UUID) -> dict[str, bool]:
        assert project_id == request_scope["project_id"]
        bind_contextvars(
            workspace_id=str(request_scope["workspace_id"]),
            project_id=str(project_id),
        )
        return {"ok": True}

    async def platform_owner_override() -> SimpleNamespace:
        return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)

    app.dependency_overrides[get_current_platform_session] = platform_owner_override

    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        snapshot = await app.state.event_bus.snapshot()
        subscribers = snapshot[HTTP_REQUEST_METRIC_EVENT]
        assert [entry["subscriber_id"] for entry in subscribers] == ["core.observability.http"]
        assert subscribers[0]["name"] == "http-request-metric-writer"

        current_user = await User.create(
            username=f"observability-{uuid4().hex[:10]}",
            email=f"observability-{uuid4().hex[:10]}@example.test",
        )
        organization = await Organization.create(
            slug=f"observability-{uuid4().hex}",
            name="Observability integration",
            owner_user_id=current_user.id,
        )
        workspace = await Workspace.create(
            organization_id=organization.id,
            name="Observed workspace",
            owner_user_id=current_user.id,
            created_by_user_id=current_user.id,
        )
        project = await ProjectRecord.create(
            workspace_id=workspace.id,
            slug="observed-project",
            name="Observed project",
            created_by_user_id=current_user.id,
        )
        other_project = await ProjectRecord.create(
            workspace_id=workspace.id,
            slug="other-project",
            name="Other project",
            created_by_user_id=current_user.id,
        )
        request_scope.update(workspace_id=workspace.id, project_id=project.id)
        app.state.system_initialized = True

        await record_http_request_metric(
            HTTPRequestRecordFact(
                actor_user_id=current_user.id,
                workspace_id=workspace.id,
                project_id=other_project.id,
                normalized_path=f"/api/v1/projects/{other_project.id}/other",
                route_template="/api/v1/projects/{project_id}/other",
                method="GET",
                protocol="HTTP/1.1",
                status_code=503,
                duration_ms=90,
                service_name="Arclayer API",
                ingestion_source="integration_test",
            )
        )
        await _create_ai_audit(
            workspace_id=workspace.id,
            project_id=project.id,
            user_id=current_user.id,
            duration_ms=20,
        )
        await _create_ai_audit(
            workspace_id=workspace.id,
            project_id=other_project.id,
            user_id=current_user.id,
            duration_ms=80,
            status=AuditLogStatus.ERROR,
        )
        await _create_ai_audit(
            workspace_id=None,
            project_id=None,
            user_id=current_user.id,
            duration_ms=40,
        )
        now = datetime.now(UTC)
        await AuditEvent.create(
            occurred_at=now,
            event_name="project.observability.first",
            workspace_id=workspace.id,
            project_id=project.id,
        )
        await AuditEvent.create(
            occurred_at=now,
            event_name="project.observability.second",
            workspace_id=workspace.id,
            project_id=other_project.id,
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            probe_response = await client.get(f"/platform-api/v1/observability-runtime-probe/{project.id}")
            assert probe_response.status_code == 200, probe_response.text
            metric = await _wait_for_metric(route_template=probe_template, project_id=project.id)
            assert metric.workspace_id == workspace.id
            assert metric.request_count == 1
            assert metric.scope_key == f"project:{project.id}"

            project_params = {"days": 1, "projectId": encode_uuid(project.id)}
            for metric_name in ("httpRequests", "requests", "auditEvents"):
                trend_response = await client.get(
                    "/platform-api/v1/observability/trends",
                    params={**project_params, "metric": metric_name},
                )
                assert trend_response.status_code == 200, trend_response.text
                assert trend_response.json()["data"]["total"] == 1

        await asyncio.sleep(0)
        persisted_requests = sum(int(row.request_count) for row in await HTTPRequestMetricHourly.all())
        assert persisted_requests == 2

    app.dependency_overrides.clear()
    assert events.bus is app.state.event_bus
