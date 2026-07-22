from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
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
from src.modules.jobs.schema import BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.projects.builder.composition_saga_schema import BuilderCompositionSagaPhaseTransitionRequest
from src.modules.projects.builder.composition_saga_service import BuilderCompositionSagaService
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1


@dataclass(frozen=True, slots=True)
class TransitionScenario:
    service: BuilderCompositionSagaService
    payload: BuilderCompositionSagaPhaseTransitionRequest
    parent: SimpleNamespace
    planning_generation: SimpleNamespace
    change_set: SimpleNamespace
    result_revision: SimpleNamespace
    authority: SimpleNamespace
    generation_repository: SimpleNamespace
    builder_repository: SimpleNamespace
    authority_resolver: SimpleNamespace
    child_creator: SimpleNamespace
    jobs: SimpleNamespace
    organization_id: UUID
    workspace_id: UUID
    project_id: UUID
    runtime_id: UUID
    actor_user_id: UUID
    saga_id: UUID


async def test_exact_planning_transition_replay_does_not_create_a_second_child_or_job() -> None:
    scenario = _scenario()
    scenario.parent.status = BuilderCompositionSagaStatus.COMPOSITION_QUEUED
    scenario.parent.planning_change_set_id = UUID(str(scenario.payload.applied_change_set_id))
    scenario.parent.planning_result_revision_id = UUID(str(scenario.payload.applied_site_revision_id))
    scenario.parent.composition_generation_id = uuid4()

    result = await _transition(scenario)

    assert result.saga_id == scenario.saga_id
    scenario.generation_repository.get_generation.assert_not_awaited()
    scenario.child_creator.create_in_transaction.assert_not_awaited()
    scenario.jobs.publish_created_after_commit.assert_not_awaited()


async def test_planning_transition_rejects_change_set_outside_the_planning_child_candidates() -> None:
    scenario = _scenario()
    scenario.planning_generation.candidates = [{"candidateIndex": 0, "changeSetId": str(uuid4())}]

    await _assert_transition_conflict(scenario, "BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")

    scenario.builder_repository.get_change_set.assert_not_awaited()
    scenario.child_creator.create_in_transaction.assert_not_awaited()


async def test_planning_transition_rejects_a_change_set_that_has_not_been_applied() -> None:
    scenario = _scenario()
    scenario.change_set.status = "previewed"

    await _assert_transition_conflict(scenario, "BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")

    scenario.builder_repository.get_site_revision.assert_not_awaited()
    scenario.child_creator.create_in_transaction.assert_not_awaited()


async def test_planning_transition_rejects_revision_that_is_not_the_latest_apply_result() -> None:
    scenario = _scenario()
    scenario.builder_repository.get_latest_site_revision.return_value = SimpleNamespace(id=uuid4())

    await _assert_transition_conflict(scenario, "BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")

    scenario.authority_resolver.resolve.assert_not_awaited()
    scenario.child_creator.create_in_transaction.assert_not_awaited()


async def test_planning_transition_rejects_agent_authority_pin_drift() -> None:
    scenario = _scenario()
    scenario.authority.agent_version_id = uuid4()

    await _assert_transition_conflict(scenario, "BUILDER_COMPOSITION_SAGA_AUTHORITY_DRIFT")

    scenario.child_creator.create_in_transaction.assert_not_awaited()


async def test_planning_transition_rejects_targets_still_missing_canonical_planning() -> None:
    scenario = _scenario()
    page = scenario.authority.builder_context.content_structure.pages[0]
    page.purpose = None
    page.section_intents = ()

    await _assert_transition_conflict(scenario, "BUILDER_WIREFRAME_PLAN_REQUIRED")

    scenario.child_creator.create_in_transaction.assert_not_awaited()


async def _assert_transition_conflict(scenario: TransitionScenario, error: str) -> None:
    with pytest.raises(Conflict) as exc_info:
        await _transition(scenario)
    assert exc_info.value.error == error


async def _transition(scenario: TransitionScenario):
    projected = SimpleNamespace(saga_id=scenario.saga_id)
    with (
        patch.object(scenario.service, "tx", _transaction),
        patch.object(scenario.service, "_project", AsyncMock(return_value=projected)),
    ):
        return await scenario.service.transition_phase(
            organization_id=scenario.organization_id,
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
            runtime_id=scenario.runtime_id,
            actor_user_id=scenario.actor_user_id,
            saga_id=scenario.saga_id,
            payload=scenario.payload,
        )


@asynccontextmanager
async def _transaction():
    yield cast(BaseDBAsyncClient, object())


def _scenario() -> TransitionScenario:
    organization_id, workspace_id, project_id, runtime_id, actor_user_id = (uuid4() for _ in range(5))
    saga_id, planning_generation_id, composition_generation_id = (uuid4() for _ in range(3))
    initial_revision_id, result_revision_id, change_set_id = (uuid4() for _ in range(3))
    site_id, environment_id, target_id = uuid4(), uuid4(), uuid4()
    agent_id, version_id, assignment_id = (uuid4() for _ in range(3))
    target = BuilderGenerationTargetV1(kind="page", item_id=target_id)
    parent = SimpleNamespace(
        id=saga_id,
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        status=BuilderCompositionSagaStatus.PLANNING_REVIEW_PENDING,
        initial_site_revision_id=initial_revision_id,
        planning_generation_id=planning_generation_id,
        planning_change_set_id=None,
        planning_result_revision_id=None,
        composition_generation_id=None,
        targets=[target.model_dump(mode="json", by_alias=True)],
        agent_run_id=None,
        agent_id=agent_id,
        agent_version_id=version_id,
        agent_assignment_id=assignment_id,
    )
    planning_generation = SimpleNamespace(
        id=planning_generation_id,
        project_id=project_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        status="succeeded",
        candidates=[{"candidateIndex": 0, "changeSetId": str(change_set_id)}],
    )
    change_set = SimpleNamespace(
        id=change_set_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        base_site_revision_id=initial_revision_id,
        status="applied",
        applied_site_revision_id=result_revision_id,
    )
    result_revision = SimpleNamespace(
        id=result_revision_id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        base_revision_id=initial_revision_id,
        manifest_hash="sha256:" + "c" * 64,
    )
    authority = SimpleNamespace(
        agent_run_id=None,
        agent_id=agent_id,
        agent_version_id=version_id,
        agent_assignment_id=assignment_id,
        builder_context=SimpleNamespace(
            content_structure=SimpleNamespace(
                pages=(
                    SimpleNamespace(
                        item_id=target_id,
                        purpose="Explain the product and invite visitors to start.",
                        section_intents=(SimpleNamespace(id="intent.hero"),),
                    ),
                ),
                global_references=(),
            ),
            manifest=SimpleNamespace(
                page_versions=(SimpleNamespace(item_id=target_id, version_number=8),),
                global_section_versions=(),
            ),
        ),
    )
    job_result = BackgroundJobCreateResult.model_construct(job=SimpleNamespace(id=uuid4()), created=True)
    generation_repository = SimpleNamespace(get_generation=AsyncMock(return_value=planning_generation))
    builder_repository = SimpleNamespace(
        lock_project=AsyncMock(
            return_value=SimpleNamespace(
                authoring_state=ProjectAuthoringState.READY,
                authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
            )
        ),
        get_change_set=AsyncMock(return_value=change_set),
        get_site_revision=AsyncMock(return_value=result_revision),
        get_latest_site_revision=AsyncMock(return_value=result_revision),
    )
    authority_resolver = SimpleNamespace(resolve=AsyncMock(return_value=authority))
    child_creator = SimpleNamespace(
        create_in_transaction=AsyncMock(
            return_value=SimpleNamespace(
                generation=SimpleNamespace(id=composition_generation_id),
                job_result=job_result,
            )
        )
    )
    jobs = SimpleNamespace(publish_created_after_commit=AsyncMock())
    service = BuilderCompositionSagaService(
        repository=SimpleNamespace(get_saga=AsyncMock(return_value=parent), update_saga=AsyncMock()),
        generation_repository=generation_repository,
        builder_repository=builder_repository,
        authority_resolver=authority_resolver,
        composition_child_creator=child_creator,
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )
    return TransitionScenario(
        service=service,
        payload=BuilderCompositionSagaPhaseTransitionRequest(
            expected_phase="planning",
            applied_change_set_id=change_set_id,
            applied_site_revision_id=result_revision_id,
        ),
        parent=parent,
        planning_generation=planning_generation,
        change_set=change_set,
        result_revision=result_revision,
        authority=authority,
        generation_repository=generation_repository,
        builder_repository=builder_repository,
        authority_resolver=authority_resolver,
        child_creator=child_creator,
        jobs=jobs,
        organization_id=organization_id,
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        actor_user_id=actor_user_id,
        saga_id=saga_id,
    )
