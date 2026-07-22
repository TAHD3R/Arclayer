from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from src.config import get_settings
from src.models.builder._enums import BuilderGenerationStatus
from src.models.builder.generation import BuilderGenerationRecord
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.projects.builder import generation_handler
from src.modules.projects.builder.composition_saga_job_contract import BuilderPlanningGenerationJobResult
from src.modules.projects.builder.composition_saga_projection import BuilderCompositionSagaChildProjector
from src.modules.projects.builder.composition_saga_provider import (
    BuilderPlanningCandidateV1,
    BuilderPlanningGenerationContextV1,
    BuilderPlanningGenerationTargetContextV1,
)
from src.modules.projects.builder.generation_handler import BuilderGenerationJobHandler


async def test_planning_child_generates_one_planning_only_change_set_candidate() -> None:
    saga_id, generation_id, revision_id, page_id = (uuid4() for _ in range(4))
    planning_context = BuilderPlanningGenerationContextV1(
        targets=(
            BuilderPlanningGenerationTargetContextV1(
                kind="page",
                item_id=page_id,
                expected_draft_version=7,
            ),
        )
    )
    candidate = BuilderPlanningCandidateV1.model_validate({
        "summary": "Plan the home page.",
        "operations": [
            {
                "type": "page.intent.replace",
                "operationId": "plan-home",
                "itemId": str(page_id),
                "purpose": "Explain the product and guide visitors to start.",
                "sectionIntents": [
                    {
                        "id": "intent.hero",
                        "label": "Hero",
                        "goal": "Establish the primary value proposition.",
                    }
                ],
            }
        ],
    })
    record_values = {
        "id": generation_id,
        "target_stage": "planning",
        "base_site_revision_id": revision_id,
        "base_etag": "sha256:" + "a" * 64,
        "agent_run_id": None,
        "agent_id": uuid4(),
        "agent_version_id": uuid4(),
        "composition_saga_id": saga_id,
        "candidate_count": 1,
        "workspace_id": uuid4(),
        "project_id": uuid4(),
        "runtime_id": uuid4(),
        "objective": "Plan before composition.",
        "locale": "en-US",
    }
    record = BuilderGenerationRecord(**record_values, status=BuilderGenerationStatus.QUEUED)
    initial = generation_handler._ExecutionState(
        record=record,
        builder_context=None,
        planning_context=planning_context,
        composition_context=None,
        design_context=None,
        agent_instructions="Produce exact planning operations.",
        candidates=(),
        failures=(),
    )
    persisted = initial.model_copy(
        update={
            "record": BuilderGenerationRecord(
                **record_values,
                status=BuilderGenerationStatus.SUCCEEDED,
            ),
            "candidates": (
                generation_handler._CandidateReference(
                    candidate_index=0,
                    change_set_id=uuid4(),
                    command_key="candidate-preview",
                ),
            ),
        }
    )
    planning_generator = SimpleNamespace(generate=AsyncMock(return_value=candidate))
    builder_repository = SimpleNamespace(
        tenant_context=SimpleNamespace(
            identity=SimpleNamespace(organization_id=uuid4()),
        )
    )
    handler = BuilderGenerationJobHandler(
        settings=get_settings(),
        repository_factory=lambda: cast(object, SimpleNamespace()),
        builder_repository_factory=lambda: cast(object, builder_repository),
        design_system_repository_factory=lambda: cast(object, SimpleNamespace()),
        component_catalog_resolver=cast(object, SimpleNamespace()),
        generator=cast(object, SimpleNamespace()),
        planning_generator=cast(object, planning_generator),
        wireframe_generator=cast(object, SimpleNamespace()),
    )
    context = SimpleNamespace(
        actor_user_id=uuid4(),
        report_progress=AsyncMock(),
        checkpoint=AsyncMock(),
        idempotency_key=lambda *, step: "candidate-preview",
    )
    preview = SimpleNamespace(change_set_id=persisted.candidates[0].change_set_id)

    with (
        patch.object(handler, "_state", AsyncMock(side_effect=[initial, initial, persisted, persisted])),
        patch.object(handler, "_mark_running", AsyncMock()),
        patch.object(handler, "_record_candidate", AsyncMock()),
        patch.object(handler, "_mark_terminal", AsyncMock()),
        patch.object(
            generation_handler.SiteBuilderChangeSetService, "preview", AsyncMock(return_value=preview)
        ) as apply_preview,
    ):
        result = await handler.execute(context=context)

    assert isinstance(result, BuilderPlanningGenerationJobResult)
    assert result.saga_id == saga_id
    assert result.generation_id == generation_id
    planning_request = planning_generator.generate.await_args.kwargs["request"]
    assert planning_request.planning_context == planning_context
    assert apply_preview.await_args is not None
    preview_payload = apply_preview.await_args.kwargs["payload"]
    assert tuple(operation.type for operation in preview_payload.operations) == ("page.intent.replace",)
    assert preview_payload.base_revision_id == revision_id


async def test_planning_child_cancel_projects_parent_inside_execution_fence() -> None:
    project_id, saga_id, generation_id, job_id = (uuid4() for _ in range(4))
    running = BuilderGenerationRecord(
        id=generation_id,
        project_id=project_id,
        job_id=job_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        status=BuilderGenerationStatus.RUNNING,
    )
    cancelled = BuilderGenerationRecord(
        id=generation_id,
        project_id=project_id,
        job_id=job_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        status=BuilderGenerationStatus.CANCELLED,
    )
    repository = SimpleNamespace(
        get_generation=AsyncMock(return_value=running),
        update_generation=AsyncMock(return_value=cancelled),
    )
    is_fenced = False

    async def mark_terminal(*, generation, error_code=None):
        assert is_fenced is True
        assert generation is cancelled
        assert error_code is None

    projector = SimpleNamespace(mark_terminal=AsyncMock(side_effect=mark_terminal))
    handler = BuilderGenerationJobHandler(
        settings=get_settings(),
        repository_factory=lambda: cast(object, repository),
        builder_repository_factory=lambda: cast(object, SimpleNamespace()),
        design_system_repository_factory=lambda: cast(object, SimpleNamespace()),
        component_catalog_resolver=cast(object, SimpleNamespace()),
        generator=cast(object, SimpleNamespace()),
        wireframe_generator=cast(object, SimpleNamespace()),
        composition_saga_projector=cast(BuilderCompositionSagaChildProjector, projector),
    )

    async def run_fenced_domain_commit(operation):
        nonlocal is_fenced
        is_fenced = True
        try:
            return await operation()
        finally:
            is_fenced = False

    context = SimpleNamespace(
        lease=SimpleNamespace(job_id=job_id),
        target=SimpleNamespace(project_id=project_id),
        input_reference=SimpleNamespace(generation_id=generation_id),
        run_fenced_domain_commit=run_fenced_domain_commit,
    )

    await handler.cancel(context=context)

    assert repository.update_generation.await_args.kwargs["values"]["status"] is BuilderGenerationStatus.CANCELLED
    projector.mark_terminal.assert_awaited_once()


async def test_reconcile_reprojects_persisted_planning_terminal_inside_execution_fence() -> None:
    project_id, saga_id, generation_id, job_id, revision_id = (uuid4() for _ in range(5))
    change_set_id = uuid4()
    succeeded = BuilderGenerationRecord(
        id=generation_id,
        project_id=project_id,
        job_id=job_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        target_stage="planning",
        base_site_revision_id=revision_id,
        status=BuilderGenerationStatus.SUCCEEDED,
    )
    repository = SimpleNamespace(get_generation=AsyncMock(return_value=succeeded))
    is_fenced = False

    async def mark_terminal(*, generation, error_code=None):
        assert is_fenced is True
        assert generation is succeeded
        assert error_code is None

    projector = SimpleNamespace(mark_terminal=AsyncMock(side_effect=mark_terminal))
    handler = BuilderGenerationJobHandler(
        settings=get_settings(),
        repository_factory=lambda: cast(object, repository),
        builder_repository_factory=lambda: cast(object, SimpleNamespace()),
        design_system_repository_factory=lambda: cast(object, SimpleNamespace()),
        component_catalog_resolver=cast(object, SimpleNamespace()),
        generator=cast(object, SimpleNamespace()),
        wireframe_generator=cast(object, SimpleNamespace()),
        composition_saga_projector=cast(BuilderCompositionSagaChildProjector, projector),
    )
    state = generation_handler._ExecutionState(
        record=succeeded,
        builder_context=None,
        planning_context=None,
        composition_context=None,
        design_context=None,
        agent_instructions="Persisted planning generation.",
        candidates=(
            generation_handler._CandidateReference(
                candidate_index=0,
                change_set_id=change_set_id,
                command_key="candidate-preview",
            ),
        ),
        failures=(),
    )

    async def run_fenced_domain_commit(operation):
        nonlocal is_fenced
        is_fenced = True
        try:
            return await operation()
        finally:
            is_fenced = False

    context = SimpleNamespace(
        lease=SimpleNamespace(job_id=job_id),
        target=SimpleNamespace(project_id=project_id),
        input_reference=SimpleNamespace(generation_id=generation_id),
        run_fenced_domain_commit=run_fenced_domain_commit,
    )

    with patch.object(handler, "_state", AsyncMock(return_value=state)):
        result = await handler.reconcile(context=context)

    assert isinstance(result, BuilderPlanningGenerationJobResult)
    assert result.candidate_change_set_ids == (change_set_id,)
    projector.mark_terminal.assert_awaited_once()


async def test_project_failure_projects_exact_error_code_inside_execution_fence() -> None:
    project_id, saga_id, generation_id, job_id = (uuid4() for _ in range(4))
    running = BuilderGenerationRecord(
        id=generation_id,
        project_id=project_id,
        job_id=job_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        status=BuilderGenerationStatus.RUNNING,
    )
    failed = BuilderGenerationRecord(
        id=generation_id,
        project_id=project_id,
        job_id=job_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        status=BuilderGenerationStatus.FAILED,
    )
    repository = SimpleNamespace(
        get_generation=AsyncMock(return_value=running),
        update_generation=AsyncMock(return_value=failed),
    )
    projector = SimpleNamespace(mark_terminal=AsyncMock())
    handler = BuilderGenerationJobHandler(
        settings=get_settings(),
        repository_factory=lambda: cast(object, repository),
        builder_repository_factory=lambda: cast(object, SimpleNamespace()),
        design_system_repository_factory=lambda: cast(object, SimpleNamespace()),
        component_catalog_resolver=cast(object, SimpleNamespace()),
        generator=cast(object, SimpleNamespace()),
        wireframe_generator=cast(object, SimpleNamespace()),
        composition_saga_projector=cast(BuilderCompositionSagaChildProjector, projector),
    )
    state = generation_handler._ExecutionState(
        record=failed,
        builder_context=None,
        planning_context=None,
        composition_context=None,
        design_context=None,
        agent_instructions="Failed planning generation.",
        candidates=(),
        failures=(),
    )

    async def run_fenced_domain_commit(operation):
        return await operation()

    context = SimpleNamespace(
        lease=SimpleNamespace(job_id=job_id),
        target=SimpleNamespace(project_id=project_id),
        input_reference=SimpleNamespace(generation_id=generation_id),
        run_fenced_domain_commit=run_fenced_domain_commit,
    )
    error = PermanentJobExecutionError(
        code="BUILDER_PROVIDER_RESPONSE_INVALID",
        safe_message="Provider response is invalid",
    )

    with patch.object(handler, "_state", AsyncMock(return_value=state)):
        await handler.project_failure(context=context, error=error)

    projector.mark_terminal.assert_awaited_once_with(
        generation=failed,
        error_code="BUILDER_PROVIDER_RESPONSE_INVALID",
    )
