from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from src.agents.session import AgentSessionManager
from src.common.schemas import BaseSchema
from src.core.events import Event
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.http.pagination import PageData
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.llm.runtime import LLMRequestContext
from src.models.automation.flow import (
    AutomationFlow,
    AutomationFlowStatus,
    AutomationOperationKind,
    AutomationRunLogLevel,
    AutomationRunStatus,
    AutomationTriggerKind,
)
from src.modules.ai.schemas import AIReasoningEffort
from src.modules.projects.automation.repository import AutomationRepository
from src.modules.projects.automation.schema import AutomationFlowCreateIn, AutomationOperationIn
from src.modules.projects.automation.service import ProjectAutomationService
from src.modules.tenancy.router_helpers import tenant_payload_from_context
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope


class _FakeContentItem(BaseSchema):
    id: UUID
    model_key: str = "article"
    title: str | None = "Hello"
    slug: str = "hello"
    summary: str | None = "Summary"
    status: str = "draft"
    visibility: str = "public"
    locale: str = "en-US"
    workflow_stage: str | None = "drafting"
    publish_readiness: dict[str, bool] | None = {"ready": False}


class _FakeContentModel:
    id = uuid4()
    singular_key = "article"
    plural_key = "articles"
    name = "Article"
    description = None
    category = "custom"
    model_kind = "collection_type"
    system_managed = False
    capabilities = ["editorial"]


class _FakeContentItemReadService:
    def __init__(self, *, item_id: UUID) -> None:
        self.item = _FakeContentItem(id=item_id)
        self.get_calls: list[dict[str, object]] = []

    async def list_items_paginated(self, **kwargs):  # type: ignore[no-untyped-def]
        return PageData(items=[self.item], total=1, page=1, size=10, pages=1, next=None, prev=None)

    async def get_item(self, **kwargs):  # type: ignore[no-untyped-def]
        self.get_calls.append(kwargs)
        return self.item


class _FakeContentModelReadService:
    async def list_models_paginated(self, **kwargs):  # type: ignore[no-untyped-def]
        return PageData(items=[_FakeContentModel()], total=1, page=1, size=20, pages=1, next=None, prev=None)


class _FakeChatService:
    async def chat(
        self,
        *,
        messages: list[dict[str, str]],
        context: LLMRequestContext,
        model: str | None = None,
        reasoning_effort: AIReasoningEffort | None = None,
    ) -> dict[str, Any]:
        assert context.source == "agent"
        assert reasoning_effort is None
        assert any("Read-only tool context" in message["content"] for message in messages)
        return {
            "id": "chat_1",
            "model": model or "gpt-4o-mini",
            "content": "read-only automation analysis",
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            "finish_reason": "stop",
        }

    async def chat_stream(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("Automation agent analysis must use non-streaming chat")


class _FakeRepo:
    def __init__(self) -> None:
        self.created_runs: list[SimpleNamespace] = []
        self.created_logs: list[dict[str, object | None]] = []
        self.updated_runs: list[dict[str, object | None]] = []
        self.enabled_flows: list[SimpleNamespace] = []
        self.project_enabled_flows: list[SimpleNamespace] = []
        self.operations_by_flow: dict[UUID, list[SimpleNamespace]] = {}

    @staticmethod
    def _now() -> datetime:
        return datetime.now(tz=UTC)

    async def create_flow(self, **kwargs):  # type: ignore[no-untyped-def]
        flow_id = uuid4()
        return SimpleNamespace(
            id=flow_id,
            workspace_id=kwargs["workspace_id"],
            name=kwargs["name"],
            description=kwargs["description"],
            status=kwargs["status"],
            trigger_kind=kwargs["trigger_kind"],
            trigger_event=kwargs["trigger_event"],
            retry_limit=kwargs["retry_limit"],
            dead_letter_enabled=kwargs["dead_letter_enabled"],
            credential_binding=kwargs["credential_binding"],
            created_by_user_id=kwargs["created_by_user_id"],
            updated_by_user_id=kwargs["created_by_user_id"],
            created_at=self._now(),
            updated_at=self._now(),
        )

    async def list_operations(self, *, flow_id: UUID):  # type: ignore[no-untyped-def]
        return list(self.operations_by_flow.get(flow_id, []))

    async def create_run(self, **kwargs):  # type: ignore[no-untyped-def]
        run = SimpleNamespace(
            id=uuid4(),
            workspace_id=kwargs["workspace_id"],
            flow_id=kwargs["flow_id"],
            trigger_event=kwargs["trigger_event"],
            status=AutomationRunStatus.QUEUED,
            attempt=1,
            max_attempts=kwargs["max_attempts"],
            event_payload=kwargs["event_payload"],
            result_payload=None,
            error=None,
            started_at=None,
            completed_at=None,
            created_at=self._now(),
            updated_at=self._now(),
        )
        self.created_runs.append(run)
        return run

    async def update_run(self, run, **kwargs):  # type: ignore[no-untyped-def]
        for key, value in kwargs.items():
            setattr(run, key, value)
        self.updated_runs.append({"run_id": run.id, **kwargs})
        return run

    async def create_log(self, **kwargs):  # type: ignore[no-untyped-def]
        self.created_logs.append(kwargs)
        return SimpleNamespace(
            id=uuid4(),
            run_id=kwargs["run_id"],
            operation_id=kwargs["operation_id"],
            level=kwargs["level"],
            message=kwargs["message"],
            payload=kwargs["payload"],
            created_at=self._now(),
        )

    async def list_run_logs(self, *, workspace_id: UUID, run_id: UUID):  # type: ignore[no-untyped-def]
        return [
            SimpleNamespace(
                id=uuid4(),
                run_id=run_id,
                operation_id=log["operation_id"],
                level=log["level"],
                message=log["message"],
                payload=log["payload"],
                created_at=self._now(),
            )
            for log in self.created_logs
            if log["run_id"] == run_id and log["workspace_id"] == workspace_id
        ]

    async def list_enabled_flows_for_event(self, *, workspace_id: UUID, event_name: str):  # type: ignore[no-untyped-def]
        return [
            flow
            for flow in self.enabled_flows
            if flow.workspace_id == workspace_id and flow.trigger_event == event_name
        ]

    async def list_enabled_project_flows_for_event(  # type: ignore[no-untyped-def]
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        event_name: str,
    ):
        return [
            flow
            for flow in self.project_enabled_flows
            if flow.workspace_id == workspace_id
            and str(flow.project_id) == str(project_id)
            and flow.trigger_event == event_name
        ]


@pytest.mark.asyncio
async def test_create_project_flow_out_sets_trigger_event_and_normalizes_operations() -> None:
    repo = _FakeRepo()
    service = ProjectAutomationService(repo=cast(AutomationRepository, repo))
    workspace_id = uuid4()
    project_id = uuid4()
    actor_user_id = uuid4()

    payload = AutomationFlowCreateIn(
        name="Notify on publish",
        description="Send webhook after publish",
        trigger_kind=AutomationTriggerKind.API_KEY_ROTATED,
        status=AutomationFlowStatus.ACTIVE,
        operations=[
            AutomationOperationIn(
                name="Call webhook",
                kind=AutomationOperationKind.WEBHOOK,
                config={"url": "https://example.com/hooks/publish"},
            )
        ],
    )

    flow = await service.create_project_flow_out(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )

    assert flow.workspace_id == workspace_id
    assert flow.project_id == project_id
    assert flow.trigger_event == "project.api_key.rotated"
    assert flow.operations == []


@pytest.mark.asyncio
async def test_project_catalog_exposes_content_created_agent_analysis_only_for_project_scope() -> None:
    service = ProjectAutomationService(repo=cast(AutomationRepository, _FakeRepo()))

    global_catalog = await service.get_global_catalog_out()
    project_catalog = await service.get_project_catalog_out()

    assert AutomationTriggerKind.CONTENT_CREATED not in {trigger.kind for trigger in global_catalog.triggers}
    assert AutomationOperationKind.AGENT_ANALYSIS not in {operation.kind for operation in global_catalog.operations}
    assert AutomationTriggerKind.CONTENT_CREATED in {trigger.kind for trigger in project_catalog.triggers}
    assert AutomationOperationKind.AGENT_ANALYSIS in {operation.kind for operation in project_catalog.operations}


@pytest.mark.asyncio
async def test_execute_flow_marks_run_succeeded_and_records_operation_logs(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo()
    flow_id = uuid4()
    workspace_id = uuid4()
    repo.operations_by_flow[flow_id] = [
        SimpleNamespace(
            id=uuid4(),
            flow_id=flow_id,
            kind=AutomationOperationKind.HTTP_REQUEST,
            config={"url": "https://example.com/hooks/publish", "method": "POST"},
            sort_order=0,
            created_at=repo._now(),
            updated_at=repo._now(),
        )
    ]
    service = ProjectAutomationService(repo=cast(AutomationRepository, repo))

    async def _fake_http_operation(*, config, event):  # type: ignore[no-untyped-def]
        assert config["url"] == "https://example.com/hooks/publish"
        assert event.name == "release.published"
        return {"statusCode": 204}

    monkeypatch.setattr(service, "_execute_http_operation", _fake_http_operation)

    flow = SimpleNamespace(
        id=flow_id,
        workspace_id=workspace_id,
        dead_letter_enabled=True,
        retry_limit=0,
        status=AutomationFlowStatus.ACTIVE,
        trigger_event="release.published",
    )
    result = await service.execute_flow(
        flow=cast(AutomationFlow, flow),
        event=Event(
            name="release.published",
            payload={"workspace_id": str(workspace_id), "project_id": str(uuid4()), "site_id": str(uuid4())},
            actor_user_id=str(uuid4()),
        ),
    )

    assert result.status == AutomationRunStatus.SUCCEEDED
    assert len(result.logs) == 2
    assert result.logs[0].level == AutomationRunLogLevel.INFO
    assert result.result_payload == {
        "operations": [
            {
                "operationId": str(repo.operations_by_flow[flow_id][0].id),
                "kind": AutomationOperationKind.HTTP_REQUEST.value,
                "result": {"statusCode": 204},
            }
        ]
    }


@pytest.mark.asyncio
async def test_execute_flow_marks_run_dead_letter_on_operation_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo()
    flow_id = uuid4()
    workspace_id = uuid4()
    repo.operations_by_flow[flow_id] = [
        SimpleNamespace(
            id=uuid4(),
            flow_id=flow_id,
            kind=AutomationOperationKind.NOTIFICATION,
            config={"recipientUserId": str(uuid4()), "title": "Automation alert"},
            sort_order=0,
            created_at=repo._now(),
            updated_at=repo._now(),
        )
    ]
    service = ProjectAutomationService(repo=cast(AutomationRepository, repo))

    async def _boom(**_kwargs):  # type: ignore[no-untyped-def]
        raise RuntimeError("notification down")

    monkeypatch.setattr(service, "_execute_notification", _boom)

    flow = SimpleNamespace(
        id=flow_id,
        workspace_id=workspace_id,
        dead_letter_enabled=True,
        retry_limit=1,
        status=AutomationFlowStatus.ACTIVE,
        trigger_event="project.content.item.workflow.updated",
    )
    result = await service.execute_flow(
        flow=cast(AutomationFlow, flow),
        event=Event(name="project.content.item.workflow.updated", payload={"workspace_id": str(workspace_id)}),
    )

    assert result.status == AutomationRunStatus.DEAD_LETTER
    assert result.error == "notification down"
    assert result.logs[-1].level == AutomationRunLogLevel.ERROR


@pytest.mark.asyncio
async def test_handle_event_executes_matching_project_flows(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo()
    workspace_id = uuid4()
    project_id = uuid4()
    repo.project_enabled_flows = [
        SimpleNamespace(
            id=uuid4(),
            workspace_id=workspace_id,
            project_id=project_id,
            dead_letter_enabled=True,
            retry_limit=0,
            status=AutomationFlowStatus.ACTIVE,
            trigger_event="project.api_key.rotated",
        )
    ]
    service = ProjectAutomationService(repo=cast(AutomationRepository, repo))

    executed: list[UUID] = []

    async def _fake_execute_flow(*, flow, event):  # type: ignore[no-untyped-def]
        executed.append(flow.id)
        return SimpleNamespace(id=uuid4(), status=AutomationRunStatus.SUCCEEDED, logs=[], result_payload=None)

    monkeypatch.setattr(service, "execute_flow", _fake_execute_flow)

    result = await service.handle_event(
        Event(
            name="project.api_key.rotated",
            payload={"workspace_id": str(workspace_id), "project_id": str(project_id), "entity_id": str(uuid4())},
        )
    )

    assert len(result) == 1
    assert executed == [repo.project_enabled_flows[0].id]


@pytest.mark.asyncio
async def test_handle_event_executes_content_created_project_flows(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo()
    workspace_id = uuid4()
    project_id = uuid4()
    repo.project_enabled_flows = [
        SimpleNamespace(
            id=uuid4(),
            workspace_id=workspace_id,
            project_id=project_id,
            dead_letter_enabled=True,
            retry_limit=0,
            status=AutomationFlowStatus.ACTIVE,
            trigger_event="content.item.created",
        )
    ]
    service = ProjectAutomationService(repo=cast(AutomationRepository, repo))
    executed: list[UUID] = []

    async def _fake_execute_flow(*, flow, event):  # type: ignore[no-untyped-def]
        executed.append(flow.id)
        return SimpleNamespace(id=uuid4(), status=AutomationRunStatus.SUCCEEDED, logs=[], result_payload=None)

    monkeypatch.setattr(service, "execute_flow", _fake_execute_flow)

    result = await service.handle_event(
        Event(
            name="content.item.created",
            payload={"workspace_id": str(workspace_id), "project_id": str(project_id), "entity_id": str(uuid4())},
        )
    )

    assert len(result) == 1
    assert executed == [repo.project_enabled_flows[0].id]


@pytest.mark.asyncio
async def test_execute_agent_analysis_runs_read_only_content_agent() -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    project_id = uuid4()
    runtime_id = uuid4()
    environment_id = uuid4()
    site_id = uuid4()
    item_id = uuid4()
    actor_user_id = uuid4()
    item_reads = _FakeContentItemReadService(item_id=item_id)
    tenant_context = TenantContext(
        identity=TenantIdentity(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            schema_name="tenant_workspace",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.RUNTIME,
    )
    service = ProjectAutomationService(
        repo=cast(AutomationRepository, _FakeRepo()),
        content_read_service_factory=cast(Any, lambda _tenant_context: item_reads),
        content_model_read_service_factory=cast(Any, lambda _tenant_context, _settings: _FakeContentModelReadService()),
        agent_chat_service_factory=cast(Any, lambda _settings: _FakeChatService()),
        agent_sessions=AgentSessionManager(),
    )

    result = await service._execute_agent_analysis(
        config={},
        event=Event(
            name="content.item.created",
            payload={
                "workspace_id": str(workspace_id),
                "project_id": str(project_id),
                "runtime_id": str(runtime_id),
                "environment_id": str(environment_id),
                "site_id": str(site_id),
                "entity_id": str(item_id),
                "tenant": tenant_payload_from_context(tenant_context),
            },
            actor_user_id=str(actor_user_id),
            trace_id="trace-agent-analysis",
        ),
        workspace_id=workspace_id,
    )

    assert result["status"] == "completed"
    assert result["agentId"] == "content_analyzer"
    assert result["itemId"] == str(item_id)
    assert result["result"]["content"] == "read-only automation analysis"
    assert set(result["toolOutputs"]) == {"get_content", "analyze_content"}
    assert len(item_reads.get_calls) == 2
    assert all(call["environment_id"] == environment_id for call in item_reads.get_calls)


@pytest.mark.asyncio
async def test_execute_agent_analysis_requires_project_site_item_and_actor_context() -> None:
    service = ProjectAutomationService(repo=cast(AutomationRepository, _FakeRepo()))
    workspace_id = uuid4()
    tenant_context = TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            project_id=uuid4(),
            runtime_id=uuid4(),
            site_id=uuid4(),
            schema_name="tenant_workspace",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.RUNTIME,
    )

    with pytest.raises(BadRequest) as excinfo:
        await service._execute_agent_analysis(
            config={"actorUserId": str(uuid4())},
            event=Event(
                name="content.item.created",
                payload={
                    "workspace_id": str(workspace_id),
                    "entity_id": str(uuid4()),
                    "tenant": tenant_payload_from_context(tenant_context),
                },
            ),
            workspace_id=workspace_id,
        )

    assert excinfo.value.error == "AUTOMATION_AGENT_ANALYSIS_INVALID"


@pytest.mark.asyncio
async def test_execute_content_update_requires_lifecycle_dispatcher(monkeypatch: pytest.MonkeyPatch) -> None:
    service = ProjectAutomationService(repo=cast(Any, _FakeRepo()))
    workspace_id = uuid4()

    monkeypatch.setattr(
        "src.modules.projects.automation.service.require_tenant_context_from_payload",
        lambda _payload: SimpleNamespace(),
    )

    with pytest.raises(ServiceUnavailable) as excinfo:
        await service._execute_content_update(
            config={"itemId": str(uuid4()), "siteId": str(uuid4()), "stage": "in_review"},
            event=Event(name="project.content.item.workflow.updated", payload={"workspace_id": str(workspace_id)}),
            workspace_id=workspace_id,
        )

    assert excinfo.value.error == "AUTOMATION_LIFECYCLE_DISPATCHER_UNAVAILABLE"


@pytest.mark.asyncio
async def test_execute_content_update_passes_lifecycle_dispatcher_to_entity_manager(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dispatcher = LifecycleDispatcher()
    observed: dict[str, object] = {}

    def _fake_items_service_factory(received_tenant_context, received_lifecycle):  # type: ignore[no-untyped-def]
        observed["tenant_context"] = received_tenant_context
        observed["lifecycle"] = received_lifecycle

        class _FakeContentService:
            async def patch_workflow(self, **kwargs):  # type: ignore[no-untyped-def]
                return SimpleNamespace(id=kwargs["item_id"], workflow_stage=kwargs["payload"].stage)

        return _FakeContentService()

    service = ProjectAutomationService(
        repo=cast(Any, _FakeRepo()),
        lifecycle_dispatcher=dispatcher,
        content_items_service_factory=_fake_items_service_factory,
    )
    organization_id = uuid4()
    workspace_id = uuid4()
    project_id = uuid4()
    runtime_id = uuid4()
    site_id = uuid4()
    item_id = uuid4()
    tenant_context = TenantContext(
        identity=TenantIdentity(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            schema_name="tenant_workspace",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.RUNTIME,
    )

    result = await service._execute_content_update(
        config={"itemId": str(item_id), "siteId": str(site_id), "stage": "in_review"},
        event=Event(
            name="project.content.item.workflow.updated",
            payload={"workspace_id": str(workspace_id), "tenant": tenant_payload_from_context(tenant_context)},
        ),
        workspace_id=workspace_id,
    )

    assert observed["lifecycle"] is dispatcher
    assert observed["tenant_context"] == tenant_context
    assert result == {"itemId": str(item_id), "workflowStage": "in_review"}


def test_validate_operation_config_rejects_missing_webhook_url() -> None:
    service = ProjectAutomationService(repo=cast(AutomationRepository, _FakeRepo()))
    with pytest.raises(BadRequest) as excinfo:
        service._normalize_operations([
            AutomationOperationIn(
                name="Broken webhook",
                kind=AutomationOperationKind.WEBHOOK,
                config={},
            )
        ])

    assert excinfo.value.error == "AUTOMATION_OPERATION_CONFIG_INVALID"
