from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.runtime_wireframe_tool import (
    AgentWireframeToolExecutionRequest,
    BuilderWireframeAgentToolExecutor,
    WireframeGenerateArgsV1,
)
from src.modules.projects.builder.generation_schema import BuilderGenerationCreateRequest
from src.modules.projects.builder.generation_service import BuilderGenerationService

pytestmark = pytest.mark.unit


class _GenerationService:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        payload = cast(BuilderGenerationCreateRequest, kwargs["payload"])
        return SimpleNamespace(
            generation_id=uuid4(),
            job_id=uuid4(),
            base_revision_id=payload.base_revision_id,
            status="queued",
        )


@pytest.mark.asyncio
async def test_executor_queues_exact_run_backed_wireframe_generation_with_stable_command_key() -> None:
    organization_id = uuid4()
    runtime_id = uuid4()
    service = _GenerationService()
    resolved_projects: list[UUID] = []

    async def resolve_runtime(project_id: UUID) -> UUID | None:
        resolved_projects.append(project_id)
        return runtime_id

    executor = BuilderWireframeAgentToolExecutor(
        service_factory=lambda: cast(BuilderGenerationService, service),
        organization_id_factory=lambda: organization_id,
        runtime_id_resolver=resolve_runtime,
    )
    request = _request()

    first = await executor.execute(request=request)
    second = await executor.execute(request=request)

    assert first.target_stage == "wireframe"
    assert first.selected_page_id == request.args.page_item_id
    assert first.status == "queued"
    assert resolved_projects == [request.project_id, request.project_id]
    assert len(service.calls) == 2
    first_call, second_call = service.calls
    assert first_call["organization_id"] == organization_id
    assert first_call["workspace_id"] == request.workspace_id
    assert first_call["project_id"] == request.project_id
    assert first_call["runtime_id"] == runtime_id
    assert first_call["actor_user_id"] == request.actor_user_id
    assert first_call["idempotency_key"] == second_call["idempotency_key"]
    payload = cast(BuilderGenerationCreateRequest, first_call["payload"])
    assert payload.target_stage == "wireframe"
    assert payload.base_revision_id == request.builder_context.site_revision_id
    assert payload.base_etag == request.builder_context.manifest_hash
    assert payload.agent_run_id == request.agent_run_id
    assert payload.agent_id is None
    assert len(payload.targets) == 1
    assert payload.targets[0].kind == "page"
    assert payload.targets[0].item_id == request.args.page_item_id


@pytest.mark.asyncio
async def test_executor_fails_explicitly_when_project_runtime_is_unavailable() -> None:
    service = _GenerationService()

    async def resolve_runtime(_project_id: UUID) -> UUID | None:
        return None

    executor = BuilderWireframeAgentToolExecutor(
        service_factory=lambda: cast(BuilderGenerationService, service),
        organization_id_factory=uuid4,
        runtime_id_resolver=resolve_runtime,
    )

    with pytest.raises(ValueError, match="project Runtime is unavailable"):
        await executor.execute(request=_request())

    assert service.calls == []


def _request() -> AgentWireframeToolExecutionRequest:
    workspace_id = uuid4()
    project_id = uuid4()
    return AgentWireframeToolExecutionRequest(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=uuid4(),
        agent_run_id=uuid4(),
        tool_call_id="tool-call-wireframe-1",
        args=WireframeGenerateArgsV1(
            page_item_id=uuid4(),
            objective="Create a conversion-focused homepage composition.",
            locale="en-US",
            candidate_count=2,
        ),
        builder_context=AgentRunBuilderContextV1.model_construct(
            workspace_id=workspace_id,
            project_id=project_id,
            site_revision_id=uuid4(),
            manifest_hash="sha256:" + "a" * 64,
        ),
    )
