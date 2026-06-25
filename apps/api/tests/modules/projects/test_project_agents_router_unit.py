from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.agents.types import AgentRunContext, AgentRunEvent, AgentRunEventType, AgentRunState, AgentRunStatus
from src.config import Settings, get_settings
from src.core.exceptions import init_exception_handlers
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.ai.schemas import AIReasoningEffort
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.agents.router import router as project_agents_router
from src.modules.projects.content.items.router_helpers import get_project_content_canonical_item_reads
from src.modules.projects.content.models.router_helpers import get_project_content_canonical_models_service
from src.modules.projects.content.shared.router import ProjectContentRouteContext, require_project_content_read_context
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.runtime.service import ProjectRuntimeContext
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from src.modules.workspaces.http.schema import WorkspaceAccessType


class FakeEngine:
    async def run(
        self,
        *,
        context: AgentRunContext,
        agent_id: str,
        prompt: str,
        model: str | None,
        reasoning_effort: AIReasoningEffort | None = None,
        tool_inputs: dict | None = None,
    ) -> AgentRunState:
        return AgentRunState(
            id=uuid4(),
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            user_id=context.user_id,
            correlation_id=context.correlation_id,
            agent_id=agent_id,
            status=AgentRunStatus.COMPLETED,
            prompt=prompt,
            model=model,
            result={"content": "done"},
            tool_outputs=tool_inputs or {},
        )

    async def stream(
        self,
        *,
        context: AgentRunContext,
        agent_id: str,
        prompt: str,
        model: str | None,
        reasoning_effort: AIReasoningEffort | None = None,
        tool_inputs: dict | None = None,
    ):
        yield AgentRunEvent(event=AgentRunEventType.RUN_CREATED, data={"runId": str(uuid4()), "agentId": agent_id})
        yield AgentRunEvent(event=AgentRunEventType.MESSAGE_DELTA, data={"content": "done"})
        yield AgentRunEvent(event=AgentRunEventType.RUN_COMPLETED, data={"runId": str(uuid4())})


class FakeSessions:
    async def get_run(self, *, run_id, context):  # type: ignore[no-untyped-def]
        return AgentRunState(
            id=run_id,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            user_id=context.user_id,
            correlation_id=context.correlation_id,
            agent_id="content_analyzer",
            status=AgentRunStatus.COMPLETED,
            prompt="inspect this",
            result={"content": "restored"},
            tool_outputs={},
        )

    async def cancel_run(self, *, run_id, context):  # type: ignore[no-untyped-def]
        return AgentRunState(
            id=run_id,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            user_id=context.user_id,
            correlation_id=context.correlation_id,
            agent_id="content_analyzer",
            status=AgentRunStatus.CANCELLED,
            prompt="inspect this",
            result=None,
            tool_outputs={},
            cancellation_requested=True,
            events=[AgentRunEvent(event=AgentRunEventType.RUN_CANCELLED, data={"runId": str(run_id)})],
        )


def _route_context() -> ProjectContentRouteContext:
    project_id = uuid4()
    workspace_id = uuid4()
    organization_id = uuid4()
    runtime_id = uuid4()
    site_id = uuid4()
    tenant_context = TenantContext(
        identity=TenantIdentity(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            schema_name="workspace_test",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.PROJECT,
    )
    project_ctx = ProjectRequestContext(
        project_id=project_id,
        workspace_id=workspace_id,
        organization_id=organization_id,
        runtime_id=runtime_id,
        workspace_kind=WorkspaceKind.TEAM,
        access_type=WorkspaceAccessType.MEMBER,
        org_membership_id=uuid4(),
        is_org_owner=False,
        workspace_membership_id=uuid4(),
        visible_only=False,
        is_creator_admin=False,
    )
    runtime_ctx = ProjectRuntimeContext(
        runtime_id=runtime_id,
        project_id=project_id,
        workspace_id=workspace_id,
        site_id=site_id,
        tenant_context=tenant_context,
        kind="primary",
        name="Primary",
        slug="primary",
        default_locale="zh-CN",
        fallback_locale="en-US",
        is_active=True,
    )
    return ProjectContentRouteContext(
        project_ctx=project_ctx,
        runtime_ctx=runtime_ctx,
        project_id=project_id,
        workspace_id=workspace_id,
        organization_id=organization_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=uuid4(),
        environment_key="production",
    )


def _build_app(monkeypatch) -> FastAPI:
    ctx = _route_context()

    async def _ctx_override() -> ProjectContentRouteContext:
        return ctx

    async def _user_override():
        return uuid4()

    monkeypatch.setattr("src.modules.projects.agents.router._engine", lambda **kwargs: FakeEngine())

    app = FastAPI()
    init_exception_handlers(app, Settings(app_env="test"))
    app.include_router(project_agents_router, prefix="/api/v1")
    app.dependency_overrides[require_project_content_read_context] = _ctx_override
    app.dependency_overrides[get_current_user_id] = _user_override
    app.dependency_overrides[get_settings] = lambda: Settings(app_env="test")
    app.dependency_overrides[get_project_content_canonical_item_reads] = lambda: object()
    app.dependency_overrides[get_project_content_canonical_models_service] = lambda: object()
    return app


@pytest.mark.asyncio
async def test_list_project_agents_returns_phase3a_catalog(monkeypatch) -> None:
    app = _build_app(monkeypatch)
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/projects/{project_id}/agents")

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert {agent["agentId"] for agent in payload["agents"]} == {
        "content_analyzer",
        "content_advisor",
        "content_model_advisor",
    }
    assert all(tool["readOnly"] is True for tool in payload["tools"])


@pytest.mark.asyncio
async def test_create_project_agent_run_returns_completed_run(monkeypatch) -> None:
    app = _build_app(monkeypatch)
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/runs",
            json={"agentId": "content_analyzer", "prompt": "inspect this", "model": "gpt-4o-mini"},
        )

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["agentId"] == "content_analyzer"
    assert payload["status"] == "completed"
    assert payload["result"] == {"content": "done"}


@pytest.mark.asyncio
async def test_stream_project_agent_run_returns_sse_events(monkeypatch) -> None:
    app = _build_app(monkeypatch)
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/runs/stream",
            json={"agentId": "content_analyzer", "prompt": "inspect this"},
        )

    assert res.status_code == 200, res.text
    assert "event: run.created" in res.text
    assert "event: message.delta" in res.text
    assert 'data: {"content": "done"}' in res.text


@pytest.mark.asyncio
async def test_get_project_agent_run_restores_run_state(monkeypatch) -> None:
    monkeypatch.setattr("src.modules.projects.agents.router._AGENT_SESSIONS", FakeSessions())
    app = _build_app(monkeypatch)
    project_id = uuid4()
    run_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/projects/{project_id}/agents/runs/{run_id}")

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["id"] == str(run_id)
    assert payload["status"] == "completed"
    assert payload["result"] == {"content": "restored"}


@pytest.mark.asyncio
async def test_cancel_project_agent_run_returns_cancelled_state(monkeypatch) -> None:
    monkeypatch.setattr("src.modules.projects.agents.router._AGENT_SESSIONS", FakeSessions())
    app = _build_app(monkeypatch)
    project_id = uuid4()
    run_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(f"/api/v1/projects/{project_id}/agents/runs/{run_id}/cancel")

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["id"] == str(run_id)
    assert payload["status"] == "cancelled"
    assert payload["cancellationRequested"] is True
    assert payload["events"][-1]["event"] == "run.cancelled"
