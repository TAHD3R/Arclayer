from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.models.builder.generation import BuilderGenerationRecord
from src.modules.jobs.schema import BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.projects.builder.composition_saga_transition import BuilderCompositionChildCreator
from src.modules.projects.builder.generation_job_contract import BuilderWireframeGenerationJobInput
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1


async def test_composition_child_snapshots_post_planning_revision_and_creates_one_wireframe_job() -> None:
    organization_id, workspace_id, project_id, runtime_id, actor_user_id = (uuid4() for _ in range(5))
    saga_id, revision_id, site_id, environment_id = (uuid4() for _ in range(4))
    agent_id, version_id, assignment_id = (uuid4() for _ in range(3))
    targets = (
        BuilderGenerationTargetV1(kind="global_section", item_id=uuid4()),
        BuilderGenerationTargetV1(kind="page", item_id=uuid4()),
    )
    saga = SimpleNamespace(
        id=saga_id,
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        objective="Compose the approved page plan with its shared navigation.",
        locale="en-US",
        candidate_count=2,
        targets=[target.model_dump(mode="json", by_alias=True) for target in targets],
        knowledge_reference_ids=[str(uuid4())],
        agent_run_id=None,
        agent_id=agent_id,
        agent_version_id=version_id,
        agent_assignment_id=assignment_id,
    )
    revision = SimpleNamespace(
        id=revision_id,
        site_id=site_id,
        environment_id=environment_id,
        manifest_hash="sha256:" + "d" * 64,
    )
    builder_context = SimpleNamespace(model_dump=lambda **kwargs: {"siteRevisionId": str(revision_id)})
    authority = SimpleNamespace(
        agent_run_id=None,
        agent_id=agent_id,
        agent_version_id=version_id,
        agent_assignment_id=assignment_id,
        builder_context=builder_context,
    )
    composition_context = SimpleNamespace(model_dump=lambda **kwargs: {"targets": ["resolved"]})
    generation = BuilderGenerationRecord(id=uuid4())
    generation_repository = SimpleNamespace(create_generation=AsyncMock(return_value=generation))
    job_result = BackgroundJobCreateResult.model_construct(job=SimpleNamespace(id=uuid4()), created=True)
    real_jobs = BackgroundJobService(get_settings())
    jobs = SimpleNamespace(
        registry=real_jobs.registry,
        create_job_in_transaction=AsyncMock(return_value=job_result),
    )
    creator = BuilderCompositionChildCreator(
        generation_repository=cast(object, generation_repository),
        builder_repository=cast(object, SimpleNamespace()),
        design_system_repository=cast(object, SimpleNamespace()),
        component_catalog_resolver=cast(object, SimpleNamespace()),
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )
    conn = cast(BaseDBAsyncClient, object())

    with (
        patch(
            "src.modules.projects.builder.composition_saga_transition.resolve_wireframe_generation_context",
            AsyncMock(return_value=composition_context),
        ) as resolve_context,
        patch(
            "src.modules.projects.builder.composition_saga_transition.write_required_activity_event",
            AsyncMock(),
        ),
    ):
        result = await creator.create_in_transaction(
            organization_id=organization_id,
            saga=saga,
            revision=revision,
            authority=authority,
            conn=conn,
        )

    assert result.generation is generation
    assert result.job_result is job_result
    assert resolve_context.await_args is not None
    resolve_call = resolve_context.await_args.kwargs
    assert resolve_call["builder_context"] is builder_context
    assert resolve_call["targets"] == targets
    job_command = jobs.create_job_in_transaction.await_args.kwargs["command"]
    job_input = BuilderWireframeGenerationJobInput.model_validate(job_command.input_reference)
    assert job_input.base_site_revision_id == revision_id
    assert job_input.agent_version_id == version_id
    assert job_command.source_revision == revision.manifest_hash
    values = generation_repository.create_generation.await_args.kwargs["values"]
    assert values["base_site_revision_id"] == revision_id
    assert values["composition_saga_id"] == saga_id
    assert values["composition_saga_phase"] == "composition"
    assert values["target_stage"] == "wireframe"
    assert values["targets"] == saga.targets
    assert values["builder_context"] == {"siteRevisionId": str(revision_id)}
    assert values["composition_context"] == {"targets": ["resolved"]}
