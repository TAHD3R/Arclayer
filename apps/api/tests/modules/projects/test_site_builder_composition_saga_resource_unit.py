from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.core.exceptions import Conflict, NotFound
from src.models.builder._enums import BuilderCompositionSagaStatus
from src.modules.jobs.service import BackgroundJobService
from src.modules.projects.builder.composition_saga_job_contract import BUILDER_PLANNING_GENERATION_JOB_TYPE
from src.modules.projects.builder.composition_saga_repository import BuilderCompositionSagaRepository
from src.modules.projects.builder.composition_saga_schema import (
    BuilderCompositionSagaCancelRequest,
    BuilderCompositionSagaOut,
)
from src.modules.projects.builder.composition_saga_service import BuilderCompositionSagaService
from src.modules.projects.builder.generation_authority import BuilderGenerationAuthorityResolver
from src.modules.projects.builder.generation_job_contract import BUILDER_WIREFRAME_GENERATION_JOB_TYPE
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1
from src.modules.projects.builder.repository import SiteBuilderRepository


async def test_get_returns_the_creator_owned_composition_saga_projection() -> None:
    project_id, actor_user_id, saga_id = uuid4(), uuid4(), uuid4()
    record = SimpleNamespace(id=saga_id, project_id=project_id, actor_user_id=actor_user_id)
    repository = SimpleNamespace(get_saga=AsyncMock(return_value=record))
    service = BuilderCompositionSagaService(
        repository=cast(BuilderCompositionSagaRepository, repository),
        generation_repository=cast(BuilderGenerationRepository, SimpleNamespace()),
        builder_repository=cast(SiteBuilderRepository, SimpleNamespace()),
        authority_resolver=cast(BuilderGenerationAuthorityResolver, SimpleNamespace()),
        settings=get_settings(),
    )

    conn = cast(BaseDBAsyncClient, object())

    @asynccontextmanager
    async def transaction():
        yield conn

    projected = SimpleNamespace(saga_id=saga_id)
    with (
        patch.object(service, "tx", transaction),
        patch.object(service, "_project", AsyncMock(return_value=projected)) as project,
    ):
        result = await service.get(
            project_id=project_id,
            actor_user_id=actor_user_id,
            saga_id=saga_id,
        )

    assert result is projected
    assert repository.get_saga.await_args.kwargs == {
        "project_id": project_id,
        "saga_id": saga_id,
        "conn": conn,
        "for_update": False,
    }
    project.assert_awaited_once_with(record=record, actor_user_id=actor_user_id)


async def test_get_hides_a_composition_saga_owned_by_another_actor() -> None:
    project_id, actor_user_id, saga_id = uuid4(), uuid4(), uuid4()
    record = SimpleNamespace(id=saga_id, project_id=project_id, actor_user_id=uuid4())
    repository = SimpleNamespace(get_saga=AsyncMock(return_value=record))
    service = BuilderCompositionSagaService(
        repository=cast(BuilderCompositionSagaRepository, repository),
        generation_repository=cast(BuilderGenerationRepository, SimpleNamespace()),
        builder_repository=cast(SiteBuilderRepository, SimpleNamespace()),
        authority_resolver=cast(BuilderGenerationAuthorityResolver, SimpleNamespace()),
        settings=get_settings(),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    with patch.object(service, "tx", transaction):
        with pytest.raises(NotFound) as exc_info:
            await service.get(project_id=project_id, actor_user_id=actor_user_id, saga_id=saga_id)

    assert exc_info.value.error == "BUILDER_COMPOSITION_SAGA_NOT_FOUND"


async def test_recover_matches_the_creator_and_complete_ordered_target_tuple() -> None:
    project_id, actor_user_id = uuid4(), uuid4()
    targets = (
        BuilderGenerationTargetV1(kind="global_section", item_id=uuid4()),
        BuilderGenerationTargetV1(kind="page", item_id=uuid4()),
    )
    active_record = SimpleNamespace(id=uuid4())
    terminal_record = SimpleNamespace(id=uuid4())
    repository = SimpleNamespace(
        get_latest_recovery_saga=AsyncMock(side_effect=(active_record, terminal_record)),
    )
    service = BuilderCompositionSagaService(
        repository=cast(BuilderCompositionSagaRepository, repository),
        generation_repository=cast(BuilderGenerationRepository, SimpleNamespace()),
        builder_repository=cast(SiteBuilderRepository, SimpleNamespace()),
        authority_resolver=cast(BuilderGenerationAuthorityResolver, SimpleNamespace()),
        settings=get_settings(),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    active = BuilderCompositionSagaOut.model_construct(saga_id=active_record.id)
    terminal = BuilderCompositionSagaOut.model_construct(saga_id=terminal_record.id)
    with (
        patch.object(service, "tx", transaction),
        patch.object(service, "_project", AsyncMock(side_effect=(active, terminal))),
    ):
        result = await service.recover(
            project_id=project_id,
            actor_user_id=actor_user_id,
            targets=targets,
        )

    assert result.active is active
    assert result.latest_terminal is terminal
    persisted_targets = [target.model_dump(mode="json", by_alias=True) for target in targets]
    active_call, terminal_call = repository.get_latest_recovery_saga.await_args_list
    assert active_call.kwargs == {
        "project_id": project_id,
        "actor_user_id": actor_user_id,
        "targets": persisted_targets,
        "statuses": (
            BuilderCompositionSagaStatus.PLANNING_QUEUED,
            BuilderCompositionSagaStatus.PLANNING_RUNNING,
            BuilderCompositionSagaStatus.PLANNING_REVIEW_PENDING,
            BuilderCompositionSagaStatus.COMPOSITION_QUEUED,
            BuilderCompositionSagaStatus.COMPOSITION_RUNNING,
            BuilderCompositionSagaStatus.COMPOSITION_REVIEW_PENDING,
        ),
    }
    assert terminal_call.kwargs["statuses"] == (
        BuilderCompositionSagaStatus.COMPLETED,
        BuilderCompositionSagaStatus.FAILED,
        BuilderCompositionSagaStatus.CANCELLED,
    )


async def test_cancel_terminalizes_a_parent_waiting_for_review_without_discarding_its_candidate() -> None:
    organization_id, workspace_id, project_id, actor_user_id, saga_id = (uuid4() for _ in range(5))
    record = SimpleNamespace(
        id=saga_id,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        status=BuilderCompositionSagaStatus.COMPOSITION_REVIEW_PENDING,
    )
    repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=record),
        update_saga=AsyncMock(side_effect=lambda *, record, values, conn: SimpleNamespace(**(vars(record) | values))),
    )
    jobs = SimpleNamespace(
        request_cancellation_in_transaction=AsyncMock(),
        publish_cancellation_requested_after_commit=AsyncMock(),
    )
    service = BuilderCompositionSagaService(
        repository=cast(BuilderCompositionSagaRepository, repository),
        generation_repository=cast(BuilderGenerationRepository, SimpleNamespace()),
        builder_repository=cast(SiteBuilderRepository, SimpleNamespace()),
        authority_resolver=cast(BuilderGenerationAuthorityResolver, SimpleNamespace()),
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    projected = BuilderCompositionSagaOut.model_construct(saga_id=saga_id)
    with (
        patch.object(service, "tx", transaction),
        patch.object(service, "_project", AsyncMock(return_value=projected)),
        patch(
            "src.modules.projects.builder.composition_saga_service.write_required_activity_event",
            AsyncMock(),
        ) as write_activity,
    ):
        result = await service.cancel(
            organization_id=organization_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            saga_id=saga_id,
            payload=BuilderCompositionSagaCancelRequest(reason="The current candidate is no longer needed."),
        )

    assert result is projected
    values = repository.update_saga.await_args.kwargs["values"]
    assert values["status"] is BuilderCompositionSagaStatus.CANCELLED
    assert values["cancel_requested_by_user_id"] == actor_user_id
    assert values["cancel_reason"] == "The current candidate is no longer needed."
    assert values["cancel_requested_at"] == values["terminal_at"]
    jobs.request_cancellation_in_transaction.assert_not_awaited()
    jobs.publish_cancellation_requested_after_commit.assert_not_awaited()
    assert write_activity.await_args is not None
    activity = write_activity.await_args.kwargs["payload"]
    assert activity.event_name == "project.builder.composition_saga.cancelled"


async def test_cancel_requests_cooperative_cancellation_for_the_active_composition_child() -> None:
    organization_id, workspace_id, project_id, actor_user_id, saga_id = (uuid4() for _ in range(5))
    composition_generation_id, job_id = uuid4(), uuid4()
    parent = SimpleNamespace(
        id=saga_id,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        status=BuilderCompositionSagaStatus.COMPOSITION_RUNNING,
        composition_generation_id=composition_generation_id,
    )
    generation = SimpleNamespace(
        id=composition_generation_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        composition_saga_id=saga_id,
        composition_saga_phase="composition",
        status="running",
        job_id=job_id,
    )
    job = SimpleNamespace(id=job_id, job_type=BUILDER_WIREFRAME_GENERATION_JOB_TYPE)
    repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=parent),
        update_saga=AsyncMock(side_effect=lambda *, record, values, conn: SimpleNamespace(**(vars(record) | values))),
    )
    generations = SimpleNamespace(
        get_generation=AsyncMock(return_value=generation),
        get_job=AsyncMock(return_value=job),
    )
    jobs = SimpleNamespace(
        request_cancellation_in_transaction=AsyncMock(return_value=(job, True)),
        publish_cancellation_requested_after_commit=AsyncMock(),
    )
    service = BuilderCompositionSagaService(
        repository=cast(BuilderCompositionSagaRepository, repository),
        generation_repository=cast(BuilderGenerationRepository, generations),
        builder_repository=cast(SiteBuilderRepository, SimpleNamespace()),
        authority_resolver=cast(BuilderGenerationAuthorityResolver, SimpleNamespace()),
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    projected = BuilderCompositionSagaOut.model_construct(saga_id=saga_id)
    with (
        patch.object(service, "tx", transaction),
        patch.object(service, "_project", AsyncMock(return_value=projected)),
        patch(
            "src.modules.projects.builder.composition_saga_service.write_required_activity_event",
            AsyncMock(),
        ) as write_activity,
    ):
        result = await service.cancel(
            organization_id=organization_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            saga_id=saga_id,
            payload=BuilderCompositionSagaCancelRequest(reason="Stop this composition."),
        )

    assert result is projected
    values = repository.update_saga.await_args.kwargs["values"]
    assert "status" not in values
    assert values["cancel_requested_by_user_id"] == actor_user_id
    assert values["cancel_reason"] == "Stop this composition."
    jobs.request_cancellation_in_transaction.assert_awaited_once()
    jobs.publish_cancellation_requested_after_commit.assert_awaited_once_with(job=job, requested=True)
    assert write_activity.await_args is not None
    activity = write_activity.await_args.kwargs["payload"]
    assert activity.event_name == "project.builder.composition_saga.cancellation_requested"


async def test_cancel_requests_cooperative_cancellation_for_the_active_planning_child() -> None:
    organization_id, workspace_id, project_id, actor_user_id, saga_id = (uuid4() for _ in range(5))
    planning_generation_id, job_id = uuid4(), uuid4()
    parent = SimpleNamespace(
        id=saga_id,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        status=BuilderCompositionSagaStatus.PLANNING_RUNNING,
        planning_generation_id=planning_generation_id,
    )
    generation = SimpleNamespace(
        id=planning_generation_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        composition_saga_id=saga_id,
        composition_saga_phase="planning",
        status="running",
        job_id=job_id,
    )
    job = SimpleNamespace(id=job_id, job_type=BUILDER_PLANNING_GENERATION_JOB_TYPE)
    repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=parent),
        update_saga=AsyncMock(side_effect=lambda *, record, values, conn: SimpleNamespace(**(vars(record) | values))),
    )
    generations = SimpleNamespace(
        get_generation=AsyncMock(return_value=generation),
        get_job=AsyncMock(return_value=job),
    )
    jobs = SimpleNamespace(
        request_cancellation_in_transaction=AsyncMock(return_value=(job, True)),
        publish_cancellation_requested_after_commit=AsyncMock(),
    )
    service = BuilderCompositionSagaService(
        repository=cast(BuilderCompositionSagaRepository, repository),
        generation_repository=cast(BuilderGenerationRepository, generations),
        builder_repository=cast(SiteBuilderRepository, SimpleNamespace()),
        authority_resolver=cast(BuilderGenerationAuthorityResolver, SimpleNamespace()),
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    projected = BuilderCompositionSagaOut.model_construct(saga_id=saga_id)
    with (
        patch.object(service, "tx", transaction),
        patch.object(service, "_project", AsyncMock(return_value=projected)),
        patch(
            "src.modules.projects.builder.composition_saga_service.write_required_activity_event",
            AsyncMock(),
        ) as write_activity,
    ):
        result = await service.cancel(
            organization_id=organization_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            saga_id=saga_id,
            payload=BuilderCompositionSagaCancelRequest(reason="Stop planning."),
        )

    assert result is projected
    jobs.request_cancellation_in_transaction.assert_awaited_once()
    jobs.publish_cancellation_requested_after_commit.assert_awaited_once_with(job=job, requested=True)
    assert write_activity.await_args is not None
    activity = write_activity.await_args.kwargs["payload"]
    assert activity.event_name == "project.builder.composition_saga.cancellation_requested"
    assert activity.properties["phase"] == "planning"


@pytest.mark.parametrize("drift", ["child_binding", "job_type"])
async def test_cancel_rejects_active_child_or_job_contract_drift(drift: str) -> None:
    organization_id, workspace_id, project_id, actor_user_id, saga_id = (uuid4() for _ in range(5))
    generation_id, job_id = uuid4(), uuid4()
    parent = SimpleNamespace(
        id=saga_id,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        status=BuilderCompositionSagaStatus.COMPOSITION_RUNNING,
        composition_generation_id=generation_id,
    )
    generation = SimpleNamespace(
        id=generation_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        composition_saga_id=uuid4() if drift == "child_binding" else saga_id,
        composition_saga_phase="composition",
        status="running",
        job_id=job_id,
    )
    job = SimpleNamespace(
        id=job_id,
        job_type="builder.invalid.v1" if drift == "job_type" else BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
    )
    repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=parent),
        update_saga=AsyncMock(),
    )
    generations = SimpleNamespace(
        get_generation=AsyncMock(return_value=generation),
        get_job=AsyncMock(return_value=job),
    )
    jobs = SimpleNamespace(
        request_cancellation_in_transaction=AsyncMock(),
        publish_cancellation_requested_after_commit=AsyncMock(),
    )
    service = BuilderCompositionSagaService(
        repository=cast(BuilderCompositionSagaRepository, repository),
        generation_repository=cast(BuilderGenerationRepository, generations),
        builder_repository=cast(SiteBuilderRepository, SimpleNamespace()),
        authority_resolver=cast(BuilderGenerationAuthorityResolver, SimpleNamespace()),
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    with patch.object(service, "tx", transaction):
        with pytest.raises(Conflict) as exc_info:
            await service.cancel(
                organization_id=organization_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                saga_id=saga_id,
                payload=BuilderCompositionSagaCancelRequest(reason="Stop invalid child."),
            )

    assert exc_info.value.error == "BUILDER_COMPOSITION_SAGA_CHILD_INVALID"
    repository.update_saga.assert_not_awaited()
    jobs.request_cancellation_in_transaction.assert_not_awaited()
    jobs.publish_cancellation_requested_after_commit.assert_not_awaited()


async def test_cancel_replays_a_terminal_parent_without_mutation_or_duplicate_activity() -> None:
    organization_id, project_id, actor_user_id, saga_id = (uuid4() for _ in range(4))
    parent = SimpleNamespace(
        id=saga_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        status=BuilderCompositionSagaStatus.CANCELLED,
    )
    repository = SimpleNamespace(
        get_saga=AsyncMock(return_value=parent),
        update_saga=AsyncMock(),
    )
    jobs = SimpleNamespace(
        request_cancellation_in_transaction=AsyncMock(),
        publish_cancellation_requested_after_commit=AsyncMock(),
    )
    service = BuilderCompositionSagaService(
        repository=cast(BuilderCompositionSagaRepository, repository),
        generation_repository=cast(BuilderGenerationRepository, SimpleNamespace()),
        builder_repository=cast(SiteBuilderRepository, SimpleNamespace()),
        authority_resolver=cast(BuilderGenerationAuthorityResolver, SimpleNamespace()),
        settings=get_settings(),
        job_service=cast(BackgroundJobService, jobs),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    projected = BuilderCompositionSagaOut.model_construct(saga_id=saga_id)
    with (
        patch.object(service, "tx", transaction),
        patch.object(service, "_project", AsyncMock(return_value=projected)),
        patch(
            "src.modules.projects.builder.composition_saga_service.write_required_activity_event",
            AsyncMock(),
        ) as write_activity,
    ):
        result = await service.cancel(
            organization_id=organization_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            saga_id=saga_id,
            payload=BuilderCompositionSagaCancelRequest(reason="Replay."),
        )

    assert result is projected
    repository.update_saga.assert_not_awaited()
    jobs.request_cancellation_in_transaction.assert_not_awaited()
    jobs.publish_cancellation_requested_after_commit.assert_not_awaited()
    write_activity.assert_not_awaited()
