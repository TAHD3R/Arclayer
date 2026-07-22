from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Literal, cast
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.models.builder._enums import BuilderGenerationStatus
from src.models.jobs.background_job import JobInternalStatus
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_builder_context_service import AgentBuilderContextResolver
from src.modules.ai.agent_catalog_schema import ResolvedAgentAssignment
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_tool_grants import BUILDER_DESIGN_GENERATE_TOOL, BUILDER_WIREFRAME_GENERATE_TOOL
from src.modules.jobs.schema import BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.projects.builder.generation_authority import CanonicalBuilderGenerationAuthorityResolver
from src.modules.projects.builder.generation_job_contract import (
    BUILDER_DESIGN_GENERATION_JOB_TYPE,
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
    BuilderDesignGenerationJobInput,
    BuilderWireframeGenerationJobInput,
)
from src.modules.projects.builder.generation_provider import (
    BuilderDesignGenerationContextV1,
    BuilderWireframeGenerationContextV1,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import (
    BuilderGenerationCreateRequest,
    BuilderGenerationTargetV1,
)
from src.modules.projects.builder.generation_service import BuilderGenerationService
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry


async def test_direct_wireframe_authority_resolves_agent_and_context_without_run() -> None:
    workspace_id, project_id, revision_id, agent_id = (uuid4() for _ in range(4))
    resolved = ResolvedAgentAssignment(
        assignment_id=uuid4(),
        agent_id=agent_id,
        version_id=uuid4(),
        version_number=4,
        supported_execution_modes=("build",),
        tool_grants=(BUILDER_WIREFRAME_GENERATE_TOOL,),
        skill_grant_workspace_id=None,
        skill_installation_ids=(),
        delegation_agent_ids=(),
        instructions="Build an exact Wireframe candidate.",
    )
    builder_context = AgentRunBuilderContextV1.model_construct(
        workspace_id=workspace_id,
        project_id=project_id,
        site_revision_id=revision_id,
        manifest_hash="sha256:" + "a" * 64,
        context_hash="sha256:" + "b" * 64,
    )
    agents = SimpleNamespace(resolve_lead=AsyncMock(return_value=resolved))
    contexts = SimpleNamespace(resolve_run_context=AsyncMock(return_value=SimpleNamespace(context=builder_context)))
    builder_repository = SimpleNamespace(get_agent_run_for_builder=AsyncMock())
    resolver = CanonicalBuilderGenerationAuthorityResolver(
        generation_repository=cast(BuilderGenerationRepository, SimpleNamespace()),
        builder_repository=cast(SiteBuilderRepository, builder_repository),
        agent_catalog_service=cast(AgentCatalogService, agents),
        builder_context_resolver=cast(AgentBuilderContextResolver, contexts),
    )
    conn = cast(BaseDBAsyncClient, object())

    authority = await resolver.resolve(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=uuid4(),
        base_revision_id=revision_id,
        base_etag="sha256:" + "a" * 64,
        agent_run_id=None,
        agent_id=agent_id,
        required_tool_grants=(BUILDER_WIREFRAME_GENERATE_TOOL,),
        conn=conn,
    )

    assert authority.agent_run_id is None
    assert authority.agent_id == agent_id
    assert authority.agent_version_id == resolved.version_id
    assert authority.agent_assignment_id == resolved.assignment_id
    assert authority.builder_context is builder_context
    assert authority.agent_instructions == resolved.instructions
    builder_repository.get_agent_run_for_builder.assert_not_awaited()
    agents.resolve_lead.assert_awaited_once_with(
        workspace_id=workspace_id,
        project_id=project_id,
        agent_id=agent_id,
        execution_mode="build",
        conn=conn,
        ensure_catalog=False,
    )
    contexts.resolve_run_context.assert_awaited_once_with(
        workspace_id=workspace_id,
        project_id=project_id,
        site_revision_id=revision_id,
        conn=conn,
    )


@pytest.mark.parametrize("target_stage", ["wireframe", "design"])
async def test_recovery_returns_latest_active_and_terminal_for_exact_target_scope(target_stage: str) -> None:
    project_id, actor_user_id, page_id, global_section_id = (uuid4() for _ in range(4))
    targets = (
        BuilderGenerationTargetV1(kind="page", item_id=page_id),
        BuilderGenerationTargetV1(kind="global_section", item_id=global_section_id),
    )
    active = _generation_record(
        project_id=project_id,
        actor_user_id=actor_user_id,
        status=BuilderGenerationStatus.RUNNING,
        targets=targets,
    )
    terminal = _generation_record(
        project_id=project_id,
        actor_user_id=actor_user_id,
        status=BuilderGenerationStatus.PARTIAL,
        targets=targets,
    )
    jobs = {
        active.job_id: _job(active.job_id, JobInternalStatus.RUNNING),
        terminal.job_id: _job(terminal.job_id, JobInternalStatus.SUCCEEDED),
    }
    repository = SimpleNamespace(
        get_latest_recovery_generation=AsyncMock(side_effect=[active, terminal]),
        get_job=AsyncMock(side_effect=lambda *, job_id, conn: jobs[job_id]),
    )
    service = BuilderGenerationService(
        repository=cast(BuilderGenerationRepository, repository),
        builder_repository=cast(SiteBuilderRepository, SimpleNamespace()),
        settings=get_settings(),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    with patch.object(service, "tx", transaction):
        result = await service.recover(
            project_id=project_id,
            actor_user_id=actor_user_id,
            target_stage=cast(Literal["wireframe", "design"], target_stage),
            targets=targets,
        )

    assert result.active is not None
    assert result.active.generation_id == active.id
    assert result.latest_terminal is not None
    assert result.latest_terminal.generation_id == terminal.id
    first_call, second_call = repository.get_latest_recovery_generation.await_args_list
    assert first_call.kwargs["target_stage"] == target_stage
    assert second_call.kwargs["target_stage"] == target_stage
    assert first_call.kwargs["targets"] == [target.model_dump(mode="json", by_alias=True) for target in targets]
    assert first_call.kwargs["statuses"] == (
        BuilderGenerationStatus.QUEUED,
        BuilderGenerationStatus.RUNNING,
    )
    assert BuilderGenerationStatus.PARTIAL in second_call.kwargs["statuses"]


@pytest.mark.parametrize("authority_kind", ["direct", "run"])
async def test_create_wireframe_persists_exact_authority_snapshots_and_wireframe_job(
    authority_kind: str,
) -> None:
    organization_id, workspace_id, project_id, runtime_id, actor_user_id = (uuid4() for _ in range(5))
    revision_id, site_id, environment_id, page_id, global_section_id = (uuid4() for _ in range(5))
    agent_id, version_id, assignment_id, run_id = (uuid4() for _ in range(4))
    digest = "sha256:" + "a" * 64
    builder_context = AgentRunBuilderContextV1.model_construct(
        workspace_id=workspace_id,
        project_id=project_id,
        site_revision_id=revision_id,
        manifest_hash=digest,
        context_hash="sha256:" + "b" * 64,
    )
    wireframe_context = BuilderWireframeGenerationContextV1.model_construct(
        targets=(),
    )
    resolved = ResolvedAgentAssignment(
        assignment_id=assignment_id,
        agent_id=agent_id,
        version_id=version_id,
        version_number=4,
        supported_execution_modes=("build",),
        tool_grants=(BUILDER_WIREFRAME_GENERATE_TOOL,),
        skill_grant_workspace_id=None,
        skill_installation_ids=(),
        delegation_agent_ids=(),
        instructions="Build an exact Wireframe candidate.",
    )
    run = SimpleNamespace(
        site_revision_id=revision_id,
        execution_mode="build",
        lead_agent_id=agent_id,
        lead_agent_version_id=version_id,
        lead_agent_assignment_id=assignment_id,
    )
    snapshot = SimpleNamespace(
        site_revision_id=revision_id,
        context_snapshot=builder_context,
        context_hash=builder_context.context_hash,
    )
    repository = SimpleNamespace(
        get_generation=AsyncMock(return_value=None),
        get_agent_builder_snapshot=AsyncMock(return_value=snapshot),
        create_generation=AsyncMock(side_effect=lambda *, values, conn: SimpleNamespace(**values)),
    )
    builder_repository = SimpleNamespace(
        lock_project=AsyncMock(
            return_value=SimpleNamespace(
                authoring_state=ProjectAuthoringState.READY,
                authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
            )
        ),
        get_agent_run_for_builder=AsyncMock(return_value=run),
    )
    agents = SimpleNamespace(resolve_lead=AsyncMock(return_value=resolved))
    contexts = SimpleNamespace(resolve_run_context=AsyncMock(return_value=SimpleNamespace(context=builder_context)))
    settings = get_settings()
    job_id = uuid4()
    job_result = BackgroundJobCreateResult.model_construct(
        job=SimpleNamespace(id=job_id),
        created=True,
    )
    real_jobs = BackgroundJobService(settings)
    jobs = SimpleNamespace(
        registry=real_jobs.registry,
        create_job_in_transaction=AsyncMock(return_value=job_result),
        publish_created_after_commit=AsyncMock(),
    )
    service = BuilderGenerationService(
        repository=cast(BuilderGenerationRepository, repository),
        builder_repository=cast(SiteBuilderRepository, builder_repository),
        design_system_repository=cast(ProjectDesignSystemsRepository, SimpleNamespace()),
        component_catalog_resolver=get_official_component_catalog_registry(),
        agent_catalog_service=cast(AgentCatalogService, agents),
        builder_context_resolver=cast(AgentBuilderContextResolver, contexts),
        settings=settings,
        job_service=cast(BackgroundJobService, jobs),
    )
    payload = BuilderGenerationCreateRequest(
        target_stage="wireframe",
        base_revision_id=revision_id,
        base_etag=digest,
        agent_id=agent_id if authority_kind == "direct" else None,
        agent_run_id=run_id if authority_kind == "run" else None,
        objective="Generate the selected page Wireframe.",
        locale="en-US",
        candidate_count=2,
        targets=(
            BuilderGenerationTargetV1(kind="page", item_id=page_id),
            BuilderGenerationTargetV1(kind="global_section", item_id=global_section_id),
        ),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    projected = SimpleNamespace(generation_id=uuid4())
    resolve_context = AsyncMock(return_value=wireframe_context)
    with (
        patch.object(service, "tx", transaction),
        patch.object(
            service,
            "_resolve_base",
            AsyncMock(
                return_value=(
                    SimpleNamespace(id=revision_id),
                    site_id,
                    environment_id,
                    digest,
                )
            ),
        ),
        patch.object(service, "_project", AsyncMock(return_value=projected)),
        patch(
            "src.modules.projects.builder.generation_service.resolve_wireframe_generation_context",
            resolve_context,
        ),
        patch(
            "src.modules.projects.builder.generation_service.write_required_activity_event",
            AsyncMock(),
        ),
    ):
        result = await service.create(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            actor_user_id=actor_user_id,
            idempotency_key=f"wireframe-{authority_kind}",
            payload=payload,
        )

    assert result is projected
    create_call = repository.create_generation.await_args
    assert create_call is not None
    values = create_call.kwargs["values"]
    assert values["agent_run_id"] == (run_id if authority_kind == "run" else None)
    assert values["agent_id"] == agent_id
    assert values["agent_version_id"] == version_id
    assert values["agent_assignment_id"] == assignment_id
    assert values["tool_name"] == BUILDER_WIREFRAME_GENERATE_TOOL
    assert values["targets"] == [target.model_dump(mode="json", by_alias=True) for target in payload.targets]
    assert values["builder_context"] == builder_context.model_dump(mode="json", by_alias=True)
    assert values["composition_context"] == wireframe_context.model_dump(mode="json", by_alias=True)
    assert resolve_context.await_args.kwargs["targets"] == payload.targets
    job_call = jobs.create_job_in_transaction.await_args
    assert job_call is not None
    command = job_call.kwargs["command"]
    assert command.job_type == BUILDER_WIREFRAME_GENERATION_JOB_TYPE
    input_reference = BuilderWireframeGenerationJobInput.model_validate(command.input_reference)
    assert UUID(str(input_reference.agent_version_id)) == version_id
    assert UUID(str(input_reference.base_site_revision_id)) == revision_id
    jobs.publish_created_after_commit.assert_awaited_once_with(job_result)
    if authority_kind == "direct":
        builder_repository.get_agent_run_for_builder.assert_not_awaited()
    else:
        builder_repository.get_agent_run_for_builder.assert_awaited_once()


async def test_create_design_persists_distinct_context_and_design_job() -> None:
    organization_id, workspace_id, project_id, runtime_id, actor_user_id = (uuid4() for _ in range(5))
    revision_id, site_id, environment_id, page_id = (uuid4() for _ in range(4))
    agent_id, version_id, assignment_id = (uuid4() for _ in range(3))
    digest = "sha256:" + "a" * 64
    builder_context = AgentRunBuilderContextV1.model_construct(
        workspace_id=workspace_id,
        project_id=project_id,
        site_revision_id=revision_id,
        manifest_hash=digest,
        context_hash="sha256:" + "b" * 64,
    )
    design_context = BuilderDesignGenerationContextV1.model_construct(targets=())
    resolved = ResolvedAgentAssignment(
        assignment_id=assignment_id,
        agent_id=agent_id,
        version_id=version_id,
        version_number=5,
        supported_execution_modes=("build",),
        tool_grants=(BUILDER_DESIGN_GENERATE_TOOL,),
        skill_grant_workspace_id=None,
        skill_installation_ids=(),
        delegation_agent_ids=(),
        instructions="Create an exact typed Design candidate.",
    )
    repository = SimpleNamespace(
        get_generation=AsyncMock(return_value=None),
        create_generation=AsyncMock(side_effect=lambda *, values, conn: SimpleNamespace(**values)),
    )
    builder_repository = SimpleNamespace(
        lock_project=AsyncMock(
            return_value=SimpleNamespace(
                authoring_state=ProjectAuthoringState.READY,
                authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
            )
        ),
    )
    agents = SimpleNamespace(resolve_lead=AsyncMock(return_value=resolved))
    contexts = SimpleNamespace(resolve_run_context=AsyncMock(return_value=SimpleNamespace(context=builder_context)))
    settings = get_settings()
    job_result = BackgroundJobCreateResult.model_construct(job=SimpleNamespace(id=uuid4()), created=True)
    jobs = SimpleNamespace(
        registry=BackgroundJobService(settings).registry,
        create_job_in_transaction=AsyncMock(return_value=job_result),
        publish_created_after_commit=AsyncMock(),
    )
    service = BuilderGenerationService(
        repository=cast(BuilderGenerationRepository, repository),
        builder_repository=cast(SiteBuilderRepository, builder_repository),
        design_system_repository=cast(ProjectDesignSystemsRepository, SimpleNamespace()),
        component_catalog_resolver=get_official_component_catalog_registry(),
        agent_catalog_service=cast(AgentCatalogService, agents),
        builder_context_resolver=cast(AgentBuilderContextResolver, contexts),
        settings=settings,
        job_service=cast(BackgroundJobService, jobs),
    )
    payload = BuilderGenerationCreateRequest(
        target_stage="design",
        base_revision_id=revision_id,
        base_etag=digest,
        agent_id=agent_id,
        objective="Create two restrained visual directions.",
        targets=(BuilderGenerationTargetV1(kind="page", item_id=page_id),),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    projected = SimpleNamespace(generation_id=uuid4())
    resolve_context = AsyncMock(return_value=design_context)
    with (
        patch.object(service, "tx", transaction),
        patch.object(
            service,
            "_resolve_base",
            AsyncMock(return_value=(SimpleNamespace(id=revision_id), site_id, environment_id, digest)),
        ),
        patch.object(service, "_project", AsyncMock(return_value=projected)),
        patch(
            "src.modules.projects.builder.generation_service.resolve_design_generation_context",
            resolve_context,
        ),
        patch("src.modules.projects.builder.generation_service.write_required_activity_event", AsyncMock()),
    ):
        result = await service.create(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            actor_user_id=actor_user_id,
            idempotency_key="design-direct",
            payload=payload,
        )

    assert result is projected
    values = repository.create_generation.await_args.kwargs["values"]
    assert values["tool_name"] == BUILDER_DESIGN_GENERATE_TOOL
    assert values["design_context"] == design_context.model_dump(mode="json", by_alias=True)
    assert values["composition_context"] is None
    command = jobs.create_job_in_transaction.await_args.kwargs["command"]
    assert command.job_type == BUILDER_DESIGN_GENERATION_JOB_TYPE
    input_reference = BuilderDesignGenerationJobInput.model_validate(command.input_reference)
    assert UUID(str(input_reference.agent_version_id)) == version_id
    resolve_context.assert_awaited_once()


def _generation_record(
    *,
    project_id,
    actor_user_id,
    status: BuilderGenerationStatus,
    targets: tuple[BuilderGenerationTargetV1, ...] = (),
):
    now = datetime(2026, 7, 22, tzinfo=UTC)
    return SimpleNamespace(
        id=uuid4(),
        project_id=project_id,
        actor_user_id=actor_user_id,
        job_id=uuid4(),
        target_stage="wireframe",
        base_site_revision_id=uuid4(),
        base_etag="sha256:" + "a" * 64,
        targets=[target.model_dump(mode="json", by_alias=True) for target in targets],
        agent_run_id=None,
        agent_id=uuid4(),
        agent_version_id=uuid4(),
        agent_assignment_id=uuid4(),
        status=status,
        candidates=[],
        failures=[],
        created_at=now,
        updated_at=now,
    )


def _job(job_id, status: JobInternalStatus):
    return SimpleNamespace(
        id=job_id,
        job_type="builder.wireframe.generate",
        internal_status=status,
        phase="generating" if status is JobInternalStatus.RUNNING else "finalizing",
        status_key="BUILDER_GENERATION_STATUS_GENERATING",
        progress_completed=1,
        progress_total=4,
        cancel_requested_at=None,
        cancellation_acknowledged_at=None,
    )
