from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.runtime_design_tool import (
    AgentDesignToolExecutionRequest,
    BuilderDesignAgentToolExecutor,
    DesignGenerateArgsV1,
    build_design_approval_interruption,
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
async def test_executor_queues_exact_run_backed_design_generation_with_stable_command_key() -> None:
    organization_id, runtime_id = uuid4(), uuid4()
    service = _GenerationService()

    async def resolve_runtime(_project_id: UUID) -> UUID | None:
        return runtime_id

    executor = BuilderDesignAgentToolExecutor(
        service_factory=lambda: cast(BuilderGenerationService, service),
        organization_id_factory=lambda: organization_id,
        runtime_id_resolver=resolve_runtime,
    )
    request = _request()

    first = await executor.execute(request=request)
    second = await executor.execute(request=request)

    assert first.target_stage == "design"
    assert first.selected_page_id == request.args.page_item_id
    first_call, second_call = service.calls
    assert first_call["idempotency_key"] == second_call["idempotency_key"]
    payload = cast(BuilderGenerationCreateRequest, first_call["payload"])
    assert payload.target_stage == "design"
    assert payload.base_revision_id == request.builder_context.site_revision_id
    assert payload.base_etag == request.builder_context.manifest_hash
    assert payload.agent_run_id == request.agent_run_id
    assert payload.targets[0].item_id == request.args.page_item_id


def test_design_approval_only_grants_generation_and_does_not_apply() -> None:
    request = _request()

    interruption = build_design_approval_interruption(
        agent_run_id=request.agent_run_id,
        tool_call_id=request.tool_call_id,
        arguments=request.args,
    )

    assert interruption.tool_name == "builder.design.generate"
    assert interruption.approval is not None
    assert interruption.approval.risk.side_effect_class == "draft_write"
    assert interruption.approval.options[0].grants == ("builder.design.generate",)
    assert "builder.design.apply" not in interruption.approval.options[0].grants


def _request() -> AgentDesignToolExecutionRequest:
    workspace_id, project_id = uuid4(), uuid4()
    return AgentDesignToolExecutionRequest(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=uuid4(),
        agent_run_id=uuid4(),
        tool_call_id="tool-call-design-1",
        args=DesignGenerateArgsV1(
            page_item_id=uuid4(),
            objective="Create a restrained, high-contrast visual direction.",
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
