from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.models.builder._enums import BuilderCompositionSagaStatus
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.jobs.schema import BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.projects.builder.composition_saga_job_contract import (
    BUILDER_PLANNING_GENERATION_JOB_TYPE,
    BuilderPlanningGenerationJobInput,
)
from src.modules.projects.builder.composition_saga_schema import (
    BuilderCompositionSagaCreateRequest,
    BuilderCompositionSagaPhaseTransitionRequest,
)
from src.modules.projects.builder.composition_saga_service import BuilderCompositionSagaService
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1


async def test_create_persists_parent_and_planning_child_for_exact_unplanned_subset() -> None:
    organization_id, workspace_id, project_id, runtime_id, actor_user_id = (uuid4() for _ in range(5))
    revision_id, site_id, environment_id = (uuid4() for _ in range(3))
    global_section_id, page_id = uuid4(), uuid4()
    agent_id, version_id, assignment_id = (uuid4() for _ in range(3))
    manifest_hash = "sha256:" + "a" * 64
    requested_targets = (
        BuilderGenerationTargetV1(kind="global_section", item_id=global_section_id),
        BuilderGenerationTargetV1(kind="page", item_id=page_id),
    )
    builder_context = _builder_context(
        workspace_id=workspace_id,
        project_id=project_id,
        revision_id=revision_id,
        manifest_hash=manifest_hash,
        global_section_id=global_section_id,
        page_id=page_id,
    )
    authority = SimpleNamespace(
        agent_run_id=None,
        agent_id=agent_id,
        agent_version_id=version_id,
        agent_assignment_id=assignment_id,
        agent_instructions="Plan exact intent identities before composing.",
        builder_context=builder_context,
    )
    saga_repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=None),
        create_saga=AsyncMock(side_effect=lambda *, values, conn: SimpleNamespace(**values)),
    )
    generation_repository = SimpleNamespace(
        create_generation=AsyncMock(side_effect=lambda *, values, conn: SimpleNamespace(**values)),
    )
    builder_repository = SimpleNamespace(
        lock_project=AsyncMock(
            return_value=SimpleNamespace(
                authoring_state=ProjectAuthoringState.READY,
                authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
            )
        )
    )
    authority_resolver = SimpleNamespace(resolve=AsyncMock(return_value=authority))
    job_result = BackgroundJobCreateResult.model_construct(job=SimpleNamespace(id=uuid4()), created=True)
    real_jobs = BackgroundJobService(get_settings())
    jobs = SimpleNamespace(
        registry=real_jobs.registry,
        create_job_in_transaction=AsyncMock(return_value=job_result),
        publish_created_after_commit=AsyncMock(),
    )
    service = BuilderCompositionSagaService(
        repository=saga_repository,
        generation_repository=generation_repository,
        builder_repository=builder_repository,
        authority_resolver=authority_resolver,
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )
    payload = BuilderCompositionSagaCreateRequest(
        base_revision_id=revision_id,
        base_etag=manifest_hash,
        agent_id=agent_id,
        objective="Plan the missing page, then compose it with the shared header.",
        locale="en-US",
        candidate_count=2,
        targets=requested_targets,
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    projected = SimpleNamespace(saga_id=uuid4())
    with (
        patch.object(service, "tx", transaction),
        patch.object(
            service,
            "_resolve_base",
            AsyncMock(return_value=(SimpleNamespace(id=revision_id), site_id, environment_id, manifest_hash)),
        ),
        patch.object(service, "_project", AsyncMock(return_value=projected)),
        patch(
            "src.modules.projects.builder.composition_saga_service.write_required_activity_event",
            AsyncMock(),
        ),
    ):
        result = await service.create(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            actor_user_id=actor_user_id,
            idempotency_key="plan-first-home",
            payload=payload,
        )

    assert result is projected
    saga_values = saga_repository.create_saga.await_args.kwargs["values"]
    generation_values = generation_repository.create_generation.await_args.kwargs["values"]
    assert saga_values["status"] == "planning_queued"
    assert saga_values["targets"] == [target.model_dump(mode="json", by_alias=True) for target in requested_targets]
    assert saga_values["planning_targets"] == [requested_targets[1].model_dump(mode="json", by_alias=True)]
    assert saga_values["planning_generation_id"] == generation_values["id"]
    assert generation_values["composition_saga_id"] == saga_values["id"]
    assert generation_values["composition_saga_phase"] == "planning"
    assert generation_values["target_stage"] == "planning"
    assert generation_values["targets"] == saga_values["planning_targets"]
    assert generation_values["agent_id"] == agent_id
    assert generation_values["agent_version_id"] == version_id
    assert generation_values["agent_assignment_id"] == assignment_id
    assert generation_values["builder_context"] == builder_context.model_dump(mode="json", by_alias=True)
    assert [target["itemId"] for target in generation_values["planning_context"]["targets"]] == [str(page_id)]
    job_command = jobs.create_job_in_transaction.await_args.kwargs["command"]
    assert job_command.job_type == BUILDER_PLANNING_GENERATION_JOB_TYPE
    job_input = BuilderPlanningGenerationJobInput.model_validate(job_command.input_reference)
    assert job_input.saga_id == saga_values["id"]
    assert job_input.generation_id == generation_values["id"]
    assert job_input.base_site_revision_id == revision_id
    jobs.publish_created_after_commit.assert_awaited_once_with(job_result)


async def test_planning_transition_proves_apply_evidence_before_creating_composition_child() -> None:
    organization_id, workspace_id, project_id, runtime_id, actor_user_id = (uuid4() for _ in range(5))
    saga_id, planning_generation_id, composition_generation_id = (uuid4() for _ in range(3))
    initial_revision_id, result_revision_id, change_set_id = (uuid4() for _ in range(3))
    site_id, environment_id = uuid4(), uuid4()
    agent_id, version_id, assignment_id = (uuid4() for _ in range(3))
    target_id = uuid4()
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
    composition_child = SimpleNamespace(
        generation=SimpleNamespace(id=composition_generation_id),
        job_result=job_result,
    )
    saga_repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=parent),
        update_saga=AsyncMock(side_effect=lambda *, record, values, conn: SimpleNamespace(**(vars(record) | values))),
    )
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
    child_creator = SimpleNamespace(create_in_transaction=AsyncMock(return_value=composition_child))
    jobs = SimpleNamespace(publish_created_after_commit=AsyncMock())
    service = BuilderCompositionSagaService(
        repository=saga_repository,
        generation_repository=generation_repository,
        builder_repository=builder_repository,
        authority_resolver=authority_resolver,
        composition_child_creator=child_creator,
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    projected = SimpleNamespace(saga_id=saga_id)
    with (
        patch.object(service, "tx", transaction),
        patch.object(service, "_project", AsyncMock(return_value=projected)),
    ):
        result = await service.transition_phase(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            actor_user_id=actor_user_id,
            saga_id=saga_id,
            payload=BuilderCompositionSagaPhaseTransitionRequest(
                expected_phase="planning",
                applied_change_set_id=change_set_id,
                applied_site_revision_id=result_revision_id,
            ),
        )

    assert result is projected
    child_call = child_creator.create_in_transaction.await_args.kwargs
    assert child_call["saga"] is parent
    assert child_call["revision"] is result_revision
    assert child_call["authority"] is authority
    parent_values = saga_repository.update_saga.await_args.kwargs["values"]
    assert parent_values == {
        "status": BuilderCompositionSagaStatus.COMPOSITION_QUEUED,
        "waiting_reason": None,
        "planning_change_set_id": change_set_id,
        "planning_result_revision_id": result_revision_id,
        "composition_generation_id": composition_generation_id,
    }
    jobs.publish_created_after_commit.assert_awaited_once_with(job_result)


def _builder_context(
    *, workspace_id, project_id, revision_id, manifest_hash, global_section_id, page_id
) -> AgentRunBuilderContextV1:
    content_structure = SimpleNamespace(
        pages=(SimpleNamespace(item_id=page_id, purpose=None, section_intents=()),),
        global_references=(
            SimpleNamespace(
                item_id=global_section_id,
                purpose="Provide consistent site navigation.",
                section_intents=(SimpleNamespace(id="intent.navigation"),),
            ),
        ),
    )
    manifest = SimpleNamespace(
        page_versions=(SimpleNamespace(item_id=page_id, version_number=7),),
        global_section_versions=(SimpleNamespace(item_id=global_section_id, version_number=3),),
    )
    return AgentRunBuilderContextV1.model_construct(
        workspace_id=workspace_id,
        project_id=project_id,
        site_revision_id=revision_id,
        manifest_hash=manifest_hash,
        context_hash="sha256:" + "b" * 64,
        content_structure=content_structure,
        manifest=manifest,
    )
