from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.builder._enums import BuilderCompositionSagaStatus
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.modules.jobs.service import BackgroundJobService
from src.modules.projects.builder.composition_saga_schema import BuilderCompositionSagaPhaseTransitionRequest
from src.modules.projects.builder.composition_saga_service import BuilderCompositionSagaService


@dataclass(frozen=True, slots=True)
class CompletionScenario:
    service: BuilderCompositionSagaService
    payload: BuilderCompositionSagaPhaseTransitionRequest
    parent: SimpleNamespace
    generation: SimpleNamespace
    change_set: SimpleNamespace
    revision: SimpleNamespace
    saga_repository: SimpleNamespace
    generation_repository: SimpleNamespace
    builder_repository: SimpleNamespace
    jobs: SimpleNamespace
    organization_id: UUID
    workspace_id: UUID
    project_id: UUID
    runtime_id: UUID
    actor_user_id: UUID
    saga_id: UUID


async def test_composition_transition_proves_wireframe_apply_evidence_before_completing_parent() -> None:
    scenario = _scenario()

    result, write_activity = await _transition(scenario)

    assert result.saga_id == scenario.saga_id
    values = scenario.saga_repository.update_saga.await_args.kwargs["values"]
    assert values["status"] is BuilderCompositionSagaStatus.COMPLETED
    assert values["waiting_reason"] is None
    assert values["composition_change_set_id"] == UUID(str(scenario.payload.applied_change_set_id))
    assert values["composition_result_revision_id"] == UUID(str(scenario.payload.applied_site_revision_id))
    assert isinstance(values["terminal_at"], datetime)
    activity = write_activity.await_args.kwargs["payload"]
    assert activity.event_name == "project.builder.composition_saga.completed"
    assert activity.entity_id == scenario.saga_id
    assert activity.properties == {
        "compositionGenerationId": str(scenario.parent.composition_generation_id),
        "compositionChangeSetId": str(scenario.payload.applied_change_set_id),
        "compositionResultRevisionId": str(scenario.payload.applied_site_revision_id),
    }
    scenario.jobs.publish_created_after_commit.assert_not_awaited()


async def test_exact_composition_transition_replay_does_not_repeat_evidence_or_activity() -> None:
    scenario = _scenario()
    scenario.parent.status = BuilderCompositionSagaStatus.COMPLETED
    scenario.parent.composition_change_set_id = UUID(str(scenario.payload.applied_change_set_id))
    scenario.parent.composition_result_revision_id = UUID(str(scenario.payload.applied_site_revision_id))

    result, write_activity = await _transition(scenario)

    assert result.saga_id == scenario.saga_id
    scenario.generation_repository.get_generation.assert_not_awaited()
    scenario.saga_repository.update_saga.assert_not_awaited()
    write_activity.assert_not_awaited()


async def test_composition_transition_rejects_change_set_outside_the_composition_child_candidates() -> None:
    scenario = _scenario()
    scenario.generation.candidates = [{"candidateIndex": 0, "changeSetId": str(uuid4())}]

    await _assert_transition_conflict(scenario, "BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")

    scenario.builder_repository.get_change_set.assert_not_awaited()
    scenario.saga_repository.update_saga.assert_not_awaited()


async def test_composition_transition_rejects_a_wireframe_change_set_that_has_not_been_applied() -> None:
    scenario = _scenario()
    scenario.change_set.status = "previewed"

    await _assert_transition_conflict(scenario, "BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")

    scenario.builder_repository.get_site_revision.assert_not_awaited()
    scenario.saga_repository.update_saga.assert_not_awaited()


async def test_composition_transition_rejects_revision_that_is_not_the_latest_apply_result() -> None:
    scenario = _scenario()
    scenario.builder_repository.get_latest_site_revision.return_value = SimpleNamespace(id=uuid4())

    await _assert_transition_conflict(scenario, "BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")

    scenario.saga_repository.update_saga.assert_not_awaited()


async def _assert_transition_conflict(scenario: CompletionScenario, error: str) -> None:
    with pytest.raises(Conflict) as exc_info:
        await _transition(scenario)
    assert exc_info.value.error == error


async def _transition(scenario: CompletionScenario):
    projected = SimpleNamespace(saga_id=scenario.saga_id)
    write_activity = AsyncMock()
    with (
        patch.object(scenario.service, "tx", _transaction),
        patch.object(scenario.service, "_project", AsyncMock(return_value=projected)),
        patch(
            "src.modules.projects.builder.composition_saga_service.write_required_activity_event",
            write_activity,
        ),
    ):
        result = await scenario.service.transition_phase(
            organization_id=scenario.organization_id,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            runtime_id=scenario.runtime_id,
            actor_user_id=scenario.actor_user_id,
            saga_id=scenario.saga_id,
            payload=scenario.payload,
        )
    return result, write_activity


@asynccontextmanager
async def _transaction():
    yield cast(BaseDBAsyncClient, object())


def _scenario() -> CompletionScenario:
    organization_id, workspace_id, project_id, runtime_id, actor_user_id = (uuid4() for _ in range(5))
    saga_id, composition_generation_id = uuid4(), uuid4()
    planning_revision_id, result_revision_id, change_set_id = (uuid4() for _ in range(3))
    site_id, environment_id = uuid4(), uuid4()
    parent = SimpleNamespace(
        id=saga_id,
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        status=BuilderCompositionSagaStatus.COMPOSITION_REVIEW_PENDING,
        planning_result_revision_id=planning_revision_id,
        composition_generation_id=composition_generation_id,
        composition_change_set_id=None,
        composition_result_revision_id=None,
    )
    generation = SimpleNamespace(
        id=composition_generation_id,
        project_id=project_id,
        composition_saga_id=saga_id,
        composition_saga_phase="composition",
        status="succeeded",
        candidates=[{"candidateIndex": 0, "changeSetId": str(change_set_id)}],
    )
    change_set = SimpleNamespace(
        id=change_set_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        base_site_revision_id=planning_revision_id,
        status="applied",
        applied_site_revision_id=result_revision_id,
    )
    revision = SimpleNamespace(
        id=result_revision_id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        base_revision_id=planning_revision_id,
        manifest_hash="sha256:" + "e" * 64,
    )
    saga_repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=parent),
        update_saga=AsyncMock(side_effect=lambda *, record, values, conn: SimpleNamespace(**(vars(record) | values))),
    )
    generation_repository = SimpleNamespace(get_generation=AsyncMock(return_value=generation))
    builder_repository = SimpleNamespace(
        lock_project=AsyncMock(
            return_value=SimpleNamespace(
                authoring_state=ProjectAuthoringState.READY,
                authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
            )
        ),
        get_change_set=AsyncMock(return_value=change_set),
        get_site_revision=AsyncMock(return_value=revision),
        get_latest_site_revision=AsyncMock(return_value=revision),
    )
    jobs = SimpleNamespace(publish_created_after_commit=AsyncMock())
    service = BuilderCompositionSagaService(
        repository=saga_repository,
        generation_repository=generation_repository,
        builder_repository=builder_repository,
        authority_resolver=SimpleNamespace(resolve=AsyncMock()),
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )
    return CompletionScenario(
        service=service,
        payload=BuilderCompositionSagaPhaseTransitionRequest(
            expected_phase="composition",
            applied_change_set_id=change_set_id,
            applied_site_revision_id=result_revision_id,
        ),
        parent=parent,
        generation=generation,
        change_set=change_set,
        revision=revision,
        saga_repository=saga_repository,
        generation_repository=generation_repository,
        builder_repository=builder_repository,
        jobs=jobs,
        organization_id=organization_id,
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        actor_user_id=actor_user_id,
        saga_id=saga_id,
    )
