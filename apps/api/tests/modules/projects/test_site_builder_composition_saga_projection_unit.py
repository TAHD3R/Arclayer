from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

from src.models.builder._enums import BuilderCompositionSagaStatus, BuilderGenerationStatus
from src.models.builder.composition_saga import BuilderCompositionSagaRecord
from src.models.builder.generation import BuilderGenerationRecord
from src.modules.projects.builder.composition_saga_projection import BuilderCompositionSagaChildProjector
from src.modules.projects.builder.composition_saga_repository import BuilderCompositionSagaRepository


async def test_planning_child_running_projects_parent_under_exact_child_binding() -> None:
    project_id, saga_id, generation_id = (uuid4() for _ in range(3))
    generation = BuilderGenerationRecord(
        id=generation_id,
        project_id=project_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        status=BuilderGenerationStatus.RUNNING,
    )
    parent = BuilderCompositionSagaRecord(
        id=saga_id,
        project_id=project_id,
        planning_generation_id=generation_id,
        status=BuilderCompositionSagaStatus.PLANNING_QUEUED,
    )
    repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=parent),
        update_saga=AsyncMock(return_value=parent),
    )
    projector = BuilderCompositionSagaChildProjector(
        repository_factory=lambda: cast(BuilderCompositionSagaRepository, repository),
    )

    await projector.mark_running(generation=generation)

    repository.get_saga.assert_awaited_once_with(
        project_id=project_id,
        saga_id=saga_id,
        conn=None,
        for_update=True,
    )
    update = repository.update_saga.await_args.kwargs
    assert update["record"] is parent
    assert update["values"] == {
        "status": BuilderCompositionSagaStatus.PLANNING_RUNNING,
        "waiting_reason": None,
    }
    assert update["conn"] is None


async def test_planning_child_success_projects_explicit_review_gate() -> None:
    project_id, saga_id, generation_id = (uuid4() for _ in range(3))
    generation = BuilderGenerationRecord(
        id=generation_id,
        project_id=project_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        status=BuilderGenerationStatus.SUCCEEDED,
    )
    parent = BuilderCompositionSagaRecord(
        id=saga_id,
        project_id=project_id,
        planning_generation_id=generation_id,
        status=BuilderCompositionSagaStatus.PLANNING_RUNNING,
    )
    repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=parent),
        update_saga=AsyncMock(return_value=parent),
    )
    projector = BuilderCompositionSagaChildProjector(
        repository_factory=lambda: cast(BuilderCompositionSagaRepository, repository),
    )

    await projector.mark_terminal(generation=generation)

    assert repository.update_saga.await_args.kwargs["values"] == {
        "status": BuilderCompositionSagaStatus.PLANNING_REVIEW_PENDING,
        "waiting_reason": "planning_review",
    }


async def test_planning_child_failure_projects_terminal_evidence() -> None:
    project_id, saga_id, generation_id = (uuid4() for _ in range(3))
    generation = BuilderGenerationRecord(
        id=generation_id,
        project_id=project_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        status=BuilderGenerationStatus.FAILED,
    )
    parent = BuilderCompositionSagaRecord(
        id=saga_id,
        project_id=project_id,
        planning_generation_id=generation_id,
        status=BuilderCompositionSagaStatus.PLANNING_RUNNING,
    )
    repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=parent),
        update_saga=AsyncMock(return_value=parent),
    )
    projector = BuilderCompositionSagaChildProjector(
        repository_factory=lambda: cast(BuilderCompositionSagaRepository, repository),
    )

    await projector.mark_terminal(
        generation=generation,
        error_code="LLM_PROVIDER_FAILED",
    )

    values = repository.update_saga.await_args.kwargs["values"]
    assert values["status"] == BuilderCompositionSagaStatus.FAILED
    assert values["waiting_reason"] is None
    assert values["terminal_error"] == {
        "code": "LLM_PROVIDER_FAILED",
        "messageKey": "LLM_PROVIDER_FAILED",
        "meta": {
            "generationId": str(generation_id),
            "phase": "planning",
        },
    }
    assert values["terminal_at"] is not None
