from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.agents.types import AgentRunContext, AgentRunEvent, AgentRunEventType, AgentRunState, AgentRunStatus
from src.common.utils.public_ids import encode_uuid
from src.config import Settings, get_settings
from src.core.exceptions import Forbidden, init_exception_handlers
from src.models.agents.approval import AgentApprovalStatus
from src.modules.ai.schema import AIReasoningEffort
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.agents.approval_schema import (
    AgentApprovalApplyOut,
    AgentApprovalOut,
    AgentContentDraftProposalOut,
    AgentContentModelDraftProposalOut,
)
from src.modules.projects.agents.router import (
    _langgraph_checkpointer_factory,
    get_agent_approval_service,
    get_agent_content_model_proposal_service,
    get_agent_content_writer_proposal_service,
    stream_project_agent_run,
)
from src.modules.projects.agents.router import (
    router as project_agents_router,
)
from src.modules.projects.agents.schema import AgentRunCreateRequest
from src.modules.projects.content.contracts.schema import ContentModelImpactPreviewOut
from src.modules.projects.content.items.router_helpers import (
    get_project_content_canonical_item_reads,
    get_project_content_canonical_items_service,
)
from src.modules.projects.content.models.router_helpers import get_project_content_canonical_models_service
from src.modules.projects.content.shared.router import (
    ProjectContentRouteContext,
    require_project_content_manage_context,
    require_project_content_read_context,
)
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
        events = []
        if tool_inputs:
            events.append(
                AgentRunEvent(
                    event=AgentRunEventType.TOOL_COMPLETED,
                    data={"toolName": "get_content", "output": {"input": tool_inputs.get("get_content", {})}},
                )
            )
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
            events=events,
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
        if tool_inputs:
            yield AgentRunEvent(
                event=AgentRunEventType.TOOL_COMPLETED,
                data={"toolName": "get_content", "output": {"input": tool_inputs.get("get_content", {})}},
            )
        yield AgentRunEvent(event=AgentRunEventType.MESSAGE_DELTA, data={"content": "done"})
        yield AgentRunEvent(
            event=AgentRunEventType.USAGE_PARTIAL,
            data={"usage": {"prompt_tokens": 1, "completion_tokens": 2}},
        )
        yield AgentRunEvent(event=AgentRunEventType.RUN_COMPLETED, data={"runId": str(uuid4())})

    async def resume(
        self,
        *,
        context: AgentRunContext,
        run_id: UUID,
        resume: dict,
    ) -> AgentRunState:
        return AgentRunState(
            id=run_id,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            user_id=context.user_id,
            correlation_id=context.correlation_id,
            agent_id="approval_agent",
            status=AgentRunStatus.COMPLETED,
            prompt="inspect this",
            model=None,
            result={"content": "resumed", "resume": resume},
            tool_outputs={},
        )


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


class DisconnectingStreamEngine:
    def __init__(self, *, run_id: UUID) -> None:
        self.run_id = run_id
        self.stream_released = asyncio.Event()

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
        _ = context, prompt, model, reasoning_effort, tool_inputs
        try:
            yield AgentRunEvent(
                event=AgentRunEventType.RUN_CREATED,
                data={"runId": str(self.run_id), "agentId": agent_id},
            )
            await asyncio.Event().wait()
        finally:
            self.stream_released.set()


class RecordingCancelSessions:
    def __init__(self) -> None:
        self.cancelled: list[tuple[UUID, AgentRunContext]] = []

    async def cancel_run(self, *, run_id, context):  # type: ignore[no-untyped-def]
        self.cancelled.append((run_id, context))
        return AgentRunState(
            id=run_id,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            user_id=context.user_id,
            correlation_id=context.correlation_id,
            agent_id="content_analyzer",
            status=AgentRunStatus.CANCELLED,
            prompt="inspect this",
            cancellation_requested=True,
            events=[AgentRunEvent(event=AgentRunEventType.RUN_CANCELLED, data={"runId": str(run_id)})],
        )


class FakeContentWriterProposalService:
    called = False

    async def create_content_draft_proposal(self, **kwargs):  # type: ignore[no-untyped-def]
        from datetime import UTC, datetime, timedelta

        from src.models.agents.approval import AgentApprovalStatus, AgentApprovalTargetType
        from src.modules.projects.agents.approval_schema import AgentApprovalOut

        self.called = True
        now = datetime(2026, 6, 26, 10, 0, tzinfo=UTC)
        approval = AgentApprovalOut(
            id=uuid4(),
            requester_user_id=kwargs["requester_user_id"],
            skill_id="content.writer",
            tool_name="content_draft_proposal",
            action="content_item.update_draft",
            target_type=AgentApprovalTargetType.CONTENT_ITEM,
            target_id=kwargs["payload"].target_id,
            expected_draft_version=2,
            target_snapshot={},
            proposed_patch={},
            dry_run={"willApply": False},
            status=AgentApprovalStatus.PENDING,
            expires_at=now + timedelta(days=1),
            created_at=now,
            updated_at=now,
        )
        return AgentContentDraftProposalOut(
            approval=approval,
            model=kwargs["payload"].model or "gpt-4o-mini",
            usage={"prompt_tokens": 1, "completion_tokens": 2},
        )


class FakeContentModelProposalService:
    called = False

    async def create_content_model_draft_proposal(self, **kwargs):  # type: ignore[no-untyped-def]
        from datetime import UTC, datetime, timedelta

        from src.models.agents.approval import AgentApprovalStatus, AgentApprovalTargetType
        from src.modules.projects.agents.approval_schema import AgentApprovalOut

        self.called = True
        now = datetime(2026, 6, 26, 10, 0, tzinfo=UTC)
        approval = AgentApprovalOut(
            id=uuid4(),
            requester_user_id=kwargs["requester_user_id"],
            skill_id="content.modeler",
            tool_name="content_model_draft_proposal",
            action="content_model.update_schema",
            target_type=AgentApprovalTargetType.CONTENT_MODEL,
            target_id=kwargs["payload"].target_id,
            expected_draft_version=4,
            target_snapshot={},
            proposed_patch={},
            dry_run={"willApply": False},
            status=AgentApprovalStatus.PENDING,
            expires_at=now + timedelta(days=1),
            created_at=now,
            updated_at=now,
        )
        return AgentContentModelDraftProposalOut(
            approval=approval,
            model=kwargs["payload"].model or "gpt-4o-mini",
            usage={"prompt_tokens": 3, "completion_tokens": 4},
            impact_preview=ContentModelImpactPreviewOut(preview_token="signed-preview-token"),
        )


class FakeApprovalService:
    called = False

    async def create_content_dry_run(self, **kwargs):  # type: ignore[no-untyped-def]
        self.called = True
        raise AssertionError("dry-run service should not be called when content.writer is disabled")


class FakeApplyApprovalService:
    def __init__(self, *, approval_id: UUID, skill_id: str) -> None:
        self.approval_id = approval_id
        self.skill_id = skill_id
        self.apply_called = False
        self.approve_called = False
        self.modify_called = False

    def _approval(self, *, status: AgentApprovalStatus) -> AgentApprovalOut:
        from datetime import UTC, datetime, timedelta

        from src.models.agents.approval import AgentApprovalTargetType

        now = datetime(2026, 6, 26, 10, 0, tzinfo=UTC)
        is_modeler = self.skill_id == "content.modeler"
        return AgentApprovalOut(
            id=self.approval_id,
            requester_user_id=uuid4(),
            skill_id=self.skill_id,
            tool_name="content_model_draft_proposal" if is_modeler else "content_draft_proposal",
            action="content_model.update_schema" if is_modeler else "content_item.update_draft",
            target_type=AgentApprovalTargetType.CONTENT_MODEL if is_modeler else AgentApprovalTargetType.CONTENT_ITEM,
            target_id=uuid4(),
            expected_draft_version=2,
            target_snapshot={},
            proposed_patch={},
            dry_run={"willApply": False},
            status=status,
            expires_at=now + timedelta(days=1),
            created_at=now,
            updated_at=now,
        )

    async def get_approval(self, **kwargs):  # type: ignore[no-untyped-def]
        from src.models.agents.approval import AgentApprovalStatus

        assert kwargs["approval_id"] == self.approval_id
        return self._approval(status=AgentApprovalStatus.PENDING)

    async def apply(self, **kwargs):  # type: ignore[no-untyped-def]
        from src.models.agents.approval import AgentApprovalStatus

        assert kwargs["approval_id"] == self.approval_id
        self.apply_called = True
        return AgentApprovalApplyOut(approval=self._approval(status=AgentApprovalStatus.APPLIED))

    async def approve(self, **kwargs):  # type: ignore[no-untyped-def]
        from src.models.agents.approval import AgentApprovalStatus

        assert kwargs["approval_id"] == self.approval_id
        self.approve_called = True
        return self._approval(status=AgentApprovalStatus.APPROVED)

    async def modify_content_approval(self, **kwargs):  # type: ignore[no-untyped-def]
        from src.models.agents.approval import AgentApprovalStatus

        assert kwargs["approval_id"] == self.approval_id
        self.modify_called = True
        return self._approval(status=AgentApprovalStatus.PENDING)


def _writer_enabled_core_settings(
    *,
    approval_policy: str = "always_approve",
    dry_run_required: bool = True,
) -> dict[str, object]:
    return {
        "ai_agents": {
            "enabled": True,
            "skills_enabled": True,
            "allowed_skill_ids": ["content.writer"],
            "write_tools_enabled": True,
            "approval_policy": approval_policy,
            "dry_run_required": dry_run_required,
        }
    }


def _modeler_enabled_core_settings(
    *,
    approval_policy: str = "always_approve",
    dry_run_required: bool = True,
) -> dict[str, object]:
    return {
        "ai_agents": {
            "enabled": True,
            "skills_enabled": True,
            "allowed_skill_ids": ["content.modeler"],
            "write_tools_enabled": True,
            "approval_policy": approval_policy,
            "dry_run_required": dry_run_required,
        }
    }


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

    async def _engine_override(**kwargs):  # type: ignore[no-untyped-def]
        return FakeEngine()

    monkeypatch.setattr("src.modules.projects.agents.router._engine", _engine_override)

    app = FastAPI()
    init_exception_handlers(app, Settings(app_env="test"))
    app.include_router(project_agents_router, prefix="/api/v1")
    app.dependency_overrides[require_project_content_read_context] = _ctx_override
    app.dependency_overrides[require_project_content_manage_context] = _ctx_override
    app.dependency_overrides[get_current_user_id] = _user_override
    app.dependency_overrides[get_settings] = lambda: Settings(app_env="test")
    app.dependency_overrides[get_project_content_canonical_item_reads] = lambda: object()
    app.dependency_overrides[get_project_content_canonical_models_service] = lambda: object()
    app.dependency_overrides[get_agent_content_writer_proposal_service] = lambda: FakeContentWriterProposalService()
    app.dependency_overrides[get_agent_content_model_proposal_service] = lambda: FakeContentModelProposalService()
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
        "content_builder",
        "content_model_advisor",
    }
    agents_by_id = {agent["agentId"]: agent for agent in payload["agents"]}
    assert agents_by_id["content_advisor"]["mode"] == "plan"
    assert agents_by_id["content_builder"]["mode"] == "build"
    assert all(tool["readOnly"] is True for tool in payload["tools"])
    assert {skill["skillId"] for skill in payload["skills"]} == {
        "content.analysis",
        "content.build",
        "content.planning",
        "content.modeling",
        "content.writer",
        "content.modeler",
    }
    assert (
        next(skill for skill in payload["skills"] if skill["skillId"] == "content.writer")["requiresApproval"] is True
    )


@pytest.mark.asyncio
async def test_list_project_agents_ignores_removed_legacy_skill_allowlist(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": True,
                "skills_enabled": True,
                "allowed_skill_ids": ["content.analysis"],
                "write_tools_enabled": False,
            }
        }

    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/projects/{project_id}/agents")

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert {agent["agentId"] for agent in payload["agents"]} == {
        "content_analyzer",
        "content_advisor",
        "content_builder",
        "content_model_advisor",
    }
    skills = {skill["skillId"]: skill for skill in payload["skills"]}
    assert skills["content.analysis"]["enabled"] is True
    assert skills["content.planning"]["enabled"] is True


@pytest.mark.asyncio
async def test_list_project_agents_marks_all_skills_disabled_when_agents_are_disabled(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": False,
                "skills_enabled": True,
                "allowed_skill_ids": ["content.analysis", "content.writer"],
                "write_tools_enabled": True,
            }
        }

    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/projects/{project_id}/agents")

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["agents"] == []
    skills = {skill["skillId"]: skill for skill in payload["skills"]}
    assert skills["content.analysis"]["enabled"] is False
    assert skills["content.analysis"]["disabledReason"] == "agents_disabled"
    assert skills["content.writer"]["enabled"] is False
    assert skills["content.writer"]["disabledReason"] == "agents_disabled"
    assert skills["content.planning"]["enabled"] is False
    assert skills["content.planning"]["disabledReason"] == "agents_disabled"
    assert skills["content.modeler"]["enabled"] is False
    assert skills["content.modeler"]["disabledReason"] == "agents_disabled"


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
async def test_create_project_agent_run_redacts_public_tool_outputs(monkeypatch) -> None:
    app = _build_app(monkeypatch)
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/runs",
            json={
                "agentId": "content_analyzer",
                "prompt": "inspect this",
                "toolInputs": {
                    "get_content": {
                        "itemId": str(uuid4()),
                        "apiKey": "sk_live_secret",
                        "nested": {"password": "p@ssw0rd", "summary": "Keep this visible"},
                    }
                },
            },
        )

    assert res.status_code == 200, res.text
    response_text = res.text
    payload = res.json()["data"]
    tool_input = payload["toolOutputs"]["get_content"]
    event_output = payload["events"][0]["data"]["output"]["input"]

    assert "sk_live_secret" not in response_text
    assert "p@ssw0rd" not in response_text
    assert tool_input["apiKey"] == "[REDACTED]"
    assert tool_input["nested"]["password"] == "[REDACTED]"
    assert tool_input["nested"]["summary"] == "Keep this visible"
    assert event_output["apiKey"] == "[REDACTED]"
    assert event_output["nested"]["password"] == "[REDACTED]"


@pytest.mark.asyncio
async def test_create_project_agent_run_rejects_disabled_langgraph(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"enabled": False}}

    async def _engine_override(**kwargs):  # type: ignore[no-untyped-def]
        _ = kwargs
        raise AssertionError("engine should not be created when LangGraph is disabled")

    app = _build_app(monkeypatch)
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    monkeypatch.setattr("src.modules.projects.agents.router._engine", _engine_override)
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/runs",
            json={"agentId": "content_analyzer", "prompt": "inspect this"},
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_LANGGRAPH_DISABLED"
    assert payload["meta"] == {"disabledReason": "langgraph_disabled"}


@pytest.mark.asyncio
async def test_resume_project_agent_run_returns_resumed_run(monkeypatch) -> None:
    app = _build_app(monkeypatch)
    project_id = uuid4()
    run_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/runs/{run_id}/resume",
            json={"approved": True, "comment": "continue"},
        )

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["id"] == str(run_id)
    assert payload["status"] == "completed"
    assert payload["result"] == {
        "content": "resumed",
        "resume": {"approved": True, "comment": "continue", "metadata": {}},
    }


@pytest.mark.asyncio
async def test_resume_project_agent_run_requires_manage_context(monkeypatch) -> None:
    async def _engine_override(**kwargs):  # type: ignore[no-untyped-def]
        _ = kwargs
        raise AssertionError("engine should not be created without manage permission")

    async def _deny_manage_context() -> ProjectContentRouteContext:
        raise Forbidden("Project content manage permission required", error="PERMISSION_DENIED")

    app = _build_app(monkeypatch)
    monkeypatch.setattr("src.modules.projects.agents.router._engine", _engine_override)
    app.dependency_overrides[require_project_content_manage_context] = _deny_manage_context
    project_id = uuid4()
    run_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/runs/{run_id}/resume",
            json={"approved": True, "comment": "continue"},
        )

    assert res.status_code == 403, res.text
    assert res.json()["error"] == "PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_resume_project_agent_run_rejects_disabled_langgraph(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"enabled": False}}

    async def _engine_override(**kwargs):  # type: ignore[no-untyped-def]
        _ = kwargs
        raise AssertionError("engine should not be created when LangGraph is disabled")

    app = _build_app(monkeypatch)
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    monkeypatch.setattr("src.modules.projects.agents.router._engine", _engine_override)
    project_id = uuid4()
    run_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/runs/{run_id}/resume",
            json={"approved": True},
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_LANGGRAPH_DISABLED"
    assert payload["meta"] == {"disabledReason": "langgraph_disabled"}


@pytest.mark.asyncio
async def test_create_content_draft_proposal_returns_approval_checkpoint(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _writer_enabled_core_settings()

    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    project_id = uuid4()
    target_id = uuid4()
    target_public_id = encode_uuid(target_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/content-draft-proposals",
            json={
                "targetId": target_public_id,
                "instruction": "Improve the summary",
                "model": "gpt-4o-mini",
            },
        )

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["approval"]["status"] == "pending"
    assert payload["approval"]["skillId"] == "content.writer"
    assert payload["approval"]["toolName"] == "content_draft_proposal"
    assert payload["approval"]["targetId"] == target_public_id
    assert payload["model"] == "gpt-4o-mini"
    assert payload["usage"] == {"prompt_tokens": 1, "completion_tokens": 2}


@pytest.mark.asyncio
async def test_create_content_draft_proposal_rejects_disabled_write_tools(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": True,
                "write_tools_enabled": False,
            }
        }

    proposal_service = FakeContentWriterProposalService()
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_content_writer_proposal_service] = lambda: proposal_service
    project_id = uuid4()
    target_public_id = encode_uuid(uuid4())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/content-draft-proposals",
            json={
                "targetId": target_public_id,
                "instruction": "Improve the summary",
            },
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_CONTENT_WRITER_DISABLED"
    assert payload["meta"] == {"disabledReason": "write_tools_disabled"}
    assert proposal_service.called is False


@pytest.mark.asyncio
async def test_create_content_draft_proposal_rejects_unsupported_approval_policy(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _writer_enabled_core_settings(approval_policy="approve_schema_only")

    proposal_service = FakeContentWriterProposalService()
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_content_writer_proposal_service] = lambda: proposal_service
    project_id = uuid4()
    target_public_id = encode_uuid(uuid4())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/content-draft-proposals",
            json={
                "targetId": target_public_id,
                "instruction": "Improve the summary",
            },
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_APPROVAL_POLICY_UNSUPPORTED"
    assert payload["meta"] == {
        "approvalPolicy": "approve_schema_only",
        "disabledReason": "approval_policy_unsupported",
        "skillId": "content.writer",
    }
    assert proposal_service.called is False


@pytest.mark.asyncio
async def test_create_content_draft_proposal_rejects_disabled_dry_run_policy(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _writer_enabled_core_settings(dry_run_required=False)

    proposal_service = FakeContentWriterProposalService()
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_content_writer_proposal_service] = lambda: proposal_service
    project_id = uuid4()
    target_public_id = encode_uuid(uuid4())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/content-draft-proposals",
            json={
                "targetId": target_public_id,
                "instruction": "Improve the summary",
            },
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_DRY_RUN_REQUIRED"
    assert payload["meta"] == {
        "disabledReason": "dry_run_required_disabled",
        "skillId": "content.writer",
    }
    assert proposal_service.called is False


@pytest.mark.asyncio
async def test_create_content_model_draft_proposal_returns_approval_checkpoint(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _modeler_enabled_core_settings()

    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    project_id = uuid4()
    target_id = uuid4()
    target_public_id = encode_uuid(target_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/content-model-draft-proposals",
            json={
                "targetId": target_public_id,
                "instruction": "Add a summary field",
                "model": "gpt-4o-mini",
            },
        )

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["approval"]["status"] == "pending"
    assert payload["approval"]["skillId"] == "content.modeler"
    assert payload["approval"]["toolName"] == "content_model_draft_proposal"
    assert payload["approval"]["targetId"] == target_public_id
    assert payload["model"] == "gpt-4o-mini"
    assert payload["impactPreview"]["previewToken"] == "signed-preview-token"


@pytest.mark.asyncio
async def test_create_content_model_draft_proposal_allows_schema_approval_policy(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _modeler_enabled_core_settings(approval_policy="approve_schema_only")

    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    project_id = uuid4()
    target_id = uuid4()
    target_public_id = encode_uuid(target_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/content-model-draft-proposals",
            json={
                "targetId": target_public_id,
                "instruction": "Add a summary field",
            },
        )

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["approval"]["status"] == "pending"
    assert payload["approval"]["skillId"] == "content.modeler"
    assert payload["approval"]["targetId"] == target_public_id


@pytest.mark.asyncio
async def test_create_content_model_draft_proposal_rejects_unsupported_approval_policy(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _modeler_enabled_core_settings(approval_policy="auto_approved")

    proposal_service = FakeContentModelProposalService()
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_content_model_proposal_service] = lambda: proposal_service
    project_id = uuid4()
    target_public_id = encode_uuid(uuid4())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/content-model-draft-proposals",
            json={
                "targetId": target_public_id,
                "instruction": "Add a summary field",
            },
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_APPROVAL_POLICY_UNSUPPORTED"
    assert payload["meta"] == {
        "approvalPolicy": "auto_approved",
        "disabledReason": "approval_policy_unsupported",
        "skillId": "content.modeler",
    }
    assert proposal_service.called is False


@pytest.mark.asyncio
async def test_create_content_model_draft_proposal_rejects_disabled_dry_run_policy(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _modeler_enabled_core_settings(dry_run_required=False)

    proposal_service = FakeContentModelProposalService()
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_content_model_proposal_service] = lambda: proposal_service
    project_id = uuid4()
    target_public_id = encode_uuid(uuid4())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/content-model-draft-proposals",
            json={
                "targetId": target_public_id,
                "instruction": "Add a summary field",
            },
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_DRY_RUN_REQUIRED"
    assert payload["meta"] == {
        "disabledReason": "dry_run_required_disabled",
        "skillId": "content.modeler",
    }
    assert proposal_service.called is False


@pytest.mark.asyncio
async def test_create_content_model_draft_proposal_rejects_disabled_write_tools(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": True,
                "write_tools_enabled": False,
            }
        }

    proposal_service = FakeContentModelProposalService()
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_content_model_proposal_service] = lambda: proposal_service
    project_id = uuid4()
    target_public_id = encode_uuid(uuid4())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/content-model-draft-proposals",
            json={
                "targetId": target_public_id,
                "instruction": "Add a summary field",
            },
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_CONTENT_WRITER_DISABLED"
    assert payload["meta"] == {"disabledReason": "write_tools_disabled", "skillId": "content.modeler"}
    assert proposal_service.called is False


@pytest.mark.asyncio
async def test_approve_agent_approval_rejects_currently_disabled_write_skill(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": True,
                "skills_enabled": True,
                "allowed_skill_ids": ["content.writer"],
                "write_tools_enabled": False,
            }
        }

    approval_id = uuid4()
    approval_service = FakeApplyApprovalService(approval_id=approval_id, skill_id="content.writer")
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_approval_service] = lambda: approval_service
    app.dependency_overrides[get_project_content_canonical_models_service] = lambda: object()
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/approvals/{encode_uuid(approval_id)}/approve",
            json={"reason": "Do not approve this"},
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_CONTENT_WRITER_DISABLED"
    assert payload["meta"] == {"disabledReason": "write_tools_disabled", "skillId": "content.writer"}
    assert approval_service.approve_called is False


@pytest.mark.asyncio
async def test_approve_agent_modeler_approval_allows_schema_only_policy(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _modeler_enabled_core_settings(approval_policy="approve_schema_only")

    approval_id = uuid4()
    approval_service = FakeApplyApprovalService(approval_id=approval_id, skill_id="content.modeler")
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_approval_service] = lambda: approval_service
    app.dependency_overrides[get_project_content_canonical_models_service] = lambda: object()
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/approvals/{encode_uuid(approval_id)}/approve",
            json={"reason": "Approve this schema proposal"},
        )

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["status"] == "approved"
    assert payload["skillId"] == "content.modeler"
    assert approval_service.approve_called is True


@pytest.mark.asyncio
async def test_modify_agent_approval_rejects_currently_disabled_write_skill(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": True,
                "skills_enabled": True,
                "allowed_skill_ids": ["content.writer"],
                "write_tools_enabled": False,
            }
        }

    approval_id = uuid4()
    approval_service = FakeApplyApprovalService(approval_id=approval_id, skill_id="content.writer")
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_approval_service] = lambda: approval_service
    app.dependency_overrides[get_project_content_canonical_models_service] = lambda: object()
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/projects/{project_id}/agents/approvals/{encode_uuid(approval_id)}",
            json={"changeSummary": "Do not apply this"},
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_CONTENT_WRITER_DISABLED"
    assert payload["meta"] == {"disabledReason": "write_tools_disabled", "skillId": "content.writer"}
    assert approval_service.modify_called is False


@pytest.mark.asyncio
async def test_modify_agent_modeler_approval_allows_schema_only_policy(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _modeler_enabled_core_settings(approval_policy="approve_schema_only")

    approval_id = uuid4()
    approval_service = FakeApplyApprovalService(approval_id=approval_id, skill_id="content.modeler")
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_approval_service] = lambda: approval_service
    app.dependency_overrides[get_project_content_canonical_models_service] = lambda: object()
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/projects/{project_id}/agents/approvals/{encode_uuid(approval_id)}",
            json={"changeSummary": "Keep this schema proposal"},
        )

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["status"] == "pending"
    assert payload["skillId"] == "content.modeler"
    assert approval_service.modify_called is True


@pytest.mark.asyncio
async def test_apply_agent_approval_rejects_currently_disabled_write_skill(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": True,
                "skills_enabled": True,
                "allowed_skill_ids": ["content.writer"],
                "write_tools_enabled": False,
            }
        }

    approval_id = uuid4()
    approval_service = FakeApplyApprovalService(approval_id=approval_id, skill_id="content.writer")
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_approval_service] = lambda: approval_service
    app.dependency_overrides[get_project_content_canonical_items_service] = lambda: object()
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(f"/api/v1/projects/{project_id}/agents/approvals/{encode_uuid(approval_id)}/apply")

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_CONTENT_WRITER_DISABLED"
    assert payload["meta"] == {"disabledReason": "write_tools_disabled", "skillId": "content.writer"}
    assert approval_service.apply_called is False


@pytest.mark.asyncio
async def test_apply_agent_modeler_approval_allows_schema_only_policy(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return _modeler_enabled_core_settings(approval_policy="approve_schema_only")

    approval_id = uuid4()
    approval_service = FakeApplyApprovalService(approval_id=approval_id, skill_id="content.modeler")
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_approval_service] = lambda: approval_service
    app.dependency_overrides[get_project_content_canonical_items_service] = lambda: object()
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(f"/api/v1/projects/{project_id}/agents/approvals/{encode_uuid(approval_id)}/apply")

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload["approval"]["status"] == "applied"
    assert payload["approval"]["skillId"] == "content.modeler"
    assert approval_service.apply_called is True


@pytest.mark.asyncio
async def test_create_approval_dry_run_rejects_disabled_write_tools(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "ai_agents": {
                "enabled": True,
                "write_tools_enabled": False,
            }
        }

    approval_service = FakeApprovalService()
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    app = _build_app(monkeypatch)
    app.dependency_overrides[get_agent_approval_service] = lambda: approval_service
    project_id = uuid4()
    target_public_id = encode_uuid(uuid4())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/approvals/dry-run",
            json={
                "targetId": target_public_id,
                "fieldsSnapshot": {"title": "Draft"},
                "presentations": [],
            },
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_CONTENT_WRITER_DISABLED"
    assert payload["meta"] == {"disabledReason": "write_tools_disabled"}
    assert approval_service.called is False


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
    assert "event: usage.partial" in res.text
    assert 'data: {"usage": {"prompt_tokens": 1, "completion_tokens": 2}}' in res.text
    assert 'data: {"content": "done"}' in res.text


@pytest.mark.asyncio
async def test_stream_project_agent_run_cancels_created_run_on_disconnect(monkeypatch) -> None:
    run_id = uuid4()
    engine = DisconnectingStreamEngine(run_id=run_id)
    sessions = RecordingCancelSessions()
    ctx = _route_context()
    user_id = uuid4()

    async def _engine_override(**kwargs):  # type: ignore[no-untyped-def]
        _ = kwargs
        return engine

    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {}

    monkeypatch.setattr("src.modules.projects.agents.router._engine", _engine_override)
    monkeypatch.setattr("src.modules.projects.agents.router._AGENT_SESSIONS", sessions)
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)

    response = await stream_project_agent_run(
        payload=AgentRunCreateRequest(agent_id="content_analyzer", prompt="inspect this"),
        ctx=ctx,
        user_id=user_id,
        settings=Settings(app_env="test"),
        item_reads=cast(Any, object()),
        model_reads=cast(Any, object()),
    )
    body = cast(AsyncIterator[str | bytes | memoryview], response.body_iterator)

    assert await anext(body) == f'event: run.created\ndata: {{"runId": "{run_id}", "agentId": "content_analyzer"}}\n\n'

    async def next_body_chunk() -> str | bytes | memoryview:
        return await anext(body)

    pending_event = asyncio.create_task(next_body_chunk())
    await asyncio.sleep(0)
    pending_event.cancel()
    with pytest.raises(asyncio.CancelledError):
        await pending_event

    assert len(sessions.cancelled) == 1
    cancelled_run_id, cancel_context = sessions.cancelled[0]
    assert cancelled_run_id == run_id
    assert cancel_context.workspace_id == ctx.workspace_id
    assert cancel_context.project_id == ctx.project_id
    assert cancel_context.user_id == user_id
    assert cancel_context.runtime_id == ctx.runtime_id
    assert cancel_context.site_id == ctx.site_id
    assert cancel_context.environment_id == ctx.environment_id
    assert engine.stream_released.is_set()


@pytest.mark.asyncio
async def test_stream_project_agent_run_redacts_tool_completed_events(monkeypatch) -> None:
    app = _build_app(monkeypatch)
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/runs/stream",
            json={
                "agentId": "content_analyzer",
                "prompt": "inspect this",
                "toolInputs": {
                    "get_content": {
                        "itemId": str(uuid4()),
                        "previewToken": "raw-preview-token",
                        "nested": {"secret": "raw-secret", "summary": "Keep this visible"},
                    }
                },
            },
        )

    assert res.status_code == 200, res.text
    assert "event: tool.completed" in res.text
    assert "raw-preview-token" not in res.text
    assert "raw-secret" not in res.text
    assert '"previewToken": "[REDACTED]"' in res.text
    assert '"secret": "[REDACTED]"' in res.text
    assert "Keep this visible" in res.text


@pytest.mark.asyncio
async def test_stream_project_agent_run_rejects_disabled_langgraph(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"enabled": False}}

    async def _engine_override(**kwargs):  # type: ignore[no-untyped-def]
        _ = kwargs
        raise AssertionError("engine should not be created when LangGraph is disabled")

    app = _build_app(monkeypatch)
    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)
    monkeypatch.setattr("src.modules.projects.agents.router._engine", _engine_override)
    project_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/projects/{project_id}/agents/runs/stream",
            json={"agentId": "content_analyzer", "prompt": "inspect this"},
        )

    assert res.status_code == 403, res.text
    payload = res.json()
    assert payload["error"] == "AGENT_LANGGRAPH_DISABLED"
    assert payload["meta"] == {"disabledReason": "langgraph_disabled"}


@pytest.mark.asyncio
async def test_langgraph_database_checkpointer_requires_enabled_database(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"checkpointer": "database"}}

    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)

    with pytest.raises(Forbidden) as exc_info:
        await _langgraph_checkpointer_factory(Settings(app_env="test"))

    assert exc_info.value.error == "AGENT_LANGGRAPH_DATABASE_CHECKPOINTER_DISABLED"
    assert exc_info.value.meta == {"disabledReason": "database_disabled"}


@pytest.mark.asyncio
async def test_langgraph_rejects_unknown_checkpointer(monkeypatch) -> None:
    async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"langgraph": {"checkpointer": "filesystem"}}

    monkeypatch.setattr("src.modules.projects.agents.router.get_core_settings_value_cached", _core_settings)

    with pytest.raises(Forbidden) as exc_info:
        await _langgraph_checkpointer_factory(Settings(app_env="test"))

    assert exc_info.value.error == "AGENT_LANGGRAPH_CHECKPOINTER_UNSUPPORTED"
    assert exc_info.value.meta == {"checkpointer": "filesystem"}


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
async def test_get_project_agent_run_redacts_restored_tool_outputs(monkeypatch) -> None:
    class SensitiveSessions:
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
                tool_outputs={
                    "get_content": {
                        "input": {
                            "apiKey": "sk_live_restore_secret",
                            "nested": {"password": "restore-password", "summary": "Keep this visible"},
                        }
                    }
                },
                events=[
                    AgentRunEvent(
                        event=AgentRunEventType.TOOL_COMPLETED,
                        data={
                            "toolName": "get_content",
                            "output": {
                                "input": {
                                    "apiKey": "sk_live_restore_secret",
                                    "nested": {
                                        "password": "restore-password",
                                        "summary": "Keep this visible",
                                    },
                                }
                            },
                        },
                    )
                ],
            )

    monkeypatch.setattr("src.modules.projects.agents.router._AGENT_SESSIONS", SensitiveSessions())
    app = _build_app(monkeypatch)
    project_id = uuid4()
    run_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/projects/{project_id}/agents/runs/{run_id}")

    assert res.status_code == 200, res.text
    assert "sk_live_restore_secret" not in res.text
    assert "restore-password" not in res.text
    payload = res.json()["data"]
    tool_input = payload["toolOutputs"]["get_content"]["input"]
    event_input = payload["events"][0]["data"]["output"]["input"]
    assert tool_input["apiKey"] == "[REDACTED]"
    assert tool_input["nested"]["password"] == "[REDACTED]"
    assert tool_input["nested"]["summary"] == "Keep this visible"
    assert event_input["apiKey"] == "[REDACTED]"
    assert event_input["nested"]["password"] == "[REDACTED]"


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
