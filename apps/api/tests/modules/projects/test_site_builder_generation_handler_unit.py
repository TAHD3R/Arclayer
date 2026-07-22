from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.models.builder._enums import BuilderGenerationStatus
from src.models.builder.generation import BuilderGenerationRecord
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_tool_grants import BUILDER_SITEMAP_APPLY_TOOL
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandledFailure
from src.modules.projects.builder import generation_handler
from src.modules.projects.builder.change_set_schema import BuilderPageCreateOperationV1
from src.modules.projects.builder.generation_handler import BuilderGenerationJobHandler
from src.modules.projects.builder.generation_job_contract import (
    BUILDER_GENERATION_FAILED_CODE,
    BuilderGenerationJobInput,
    BuilderGenerationJobResult,
    BuilderGenerationJobTarget,
)
from src.modules.projects.builder.generation_provider import (
    BuilderSitemapCandidateV1,
    BuilderSitemapGenerator,
    BuilderSitemapGeneratorError,
    BuilderWireframeGenerator,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import BuilderGenerationFailureOut
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry

pytestmark = pytest.mark.unit


class _Context:
    def __init__(self, *, record: BuilderGenerationRecord) -> None:
        self.lease = SimpleNamespace(job_id=record.job_id, attempt_id=uuid4(), attempt_number=1)
        self.target = BuilderGenerationJobTarget(
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            runtime_id=record.runtime_id,
            environment_id=record.environment_id,
        )
        self.input_reference = BuilderGenerationJobInput(
            generation_id=record.id,
            base_site_revision_id=record.base_site_revision_id,
            agent_run_id=record.agent_run_id,
            request_hash=record.request_fingerprint,
        )
        self.actor_user_id = record.actor_user_id
        self.source_revision = record.base_manifest_hash
        self.request_fingerprint = record.request_fingerprint
        self.progress = []
        self.checkpoint_count = 0
        self.fenced_commit_count = 0
        self.reject_fenced_commits = False

    def idempotency_key(self, *, step: str) -> str:
        return f"generation:{self.input_reference.generation_id}:{step}"

    async def checkpoint(self):  # type: ignore[no-untyped-def]
        self.checkpoint_count += 1
        return SimpleNamespace(cancellation_requested=False)

    async def report_progress(self, update):  # type: ignore[no-untyped-def]
        self.progress.append(update)
        return SimpleNamespace(cancellation_requested=False)

    async def run_fenced_domain_commit(self, operation):  # type: ignore[no-untyped-def]
        self.fenced_commit_count += 1
        if self.reject_fenced_commits:
            raise PermanentJobExecutionError(
                code="BACKGROUND_JOB_LEASE_LOST",
                safe_message="lease lost",
            )
        return await operation()


class _Repository:
    def __init__(self, record: BuilderGenerationRecord) -> None:
        self.record = record
        self.updates: list[dict[str, object]] = []

    async def get_generation(self, **kwargs):  # type: ignore[no-untyped-def]
        _ = kwargs
        return self.record

    async def update_generation(self, *, record, values, conn):  # type: ignore[no-untyped-def]
        assert record is self.record
        assert conn is None
        self.updates.append(dict(values))
        for key, value in values.items():
            setattr(self.record, key, value)
        return self.record


class _Generator:
    def __init__(self, outcomes: list[BuilderSitemapCandidateV1 | BuilderSitemapGeneratorError]) -> None:
        self.outcomes = list(outcomes)
        self.requests = []

    async def generate(self, *, request):  # type: ignore[no-untyped-def]
        self.requests.append(request)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BuilderSitemapGeneratorError):
            raise outcome
        return outcome


@pytest.mark.asyncio
async def test_handler_persists_typed_candidates_and_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    record = _record(candidate_count=2)
    repository = _Repository(record)
    generator = _Generator([_candidate("home"), _candidate("about")])
    context = _Context(record=record)
    preview_calls, change_set_ids = _install_preview(monkeypatch)
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=generator,
    )

    result = await handler.execute(context=_job_context(context))

    assert isinstance(result, BuilderGenerationJobResult)
    assert result.status == "succeeded"
    assert result.candidate_change_set_ids == tuple(change_set_ids)
    assert result.failed_candidate_count == 0
    assert BuilderGenerationStatus(str(record.status)) == BuilderGenerationStatus.SUCCEEDED
    assert context.checkpoint_count == 2
    assert len(preview_calls) == 2
    assert all(call["payload"].tool_name == BUILDER_SITEMAP_APPLY_TOOL for call in preview_calls)
    assert all(call["payload"].provenance_source == "agent" for call in preview_calls)
    assert context.progress[-1].phase == "finalizing"
    assert context.progress[-1].progress_completed == context.progress[-1].progress_total


@pytest.mark.asyncio
async def test_handler_returns_partial_when_one_candidate_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    record = _record(candidate_count=2)
    repository = _Repository(record)
    generator = _Generator([
        _candidate("home"),
        BuilderSitemapGeneratorError(
            "BUILDER_GENERATION_OUTPUT_INVALID",
            continue_candidates=True,
        ),
    ])
    context = _Context(record=record)
    _install_preview(monkeypatch)
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=generator,
    )

    result = await handler.execute(context=_job_context(context))

    assert isinstance(result, BuilderGenerationJobResult)
    assert result.status == "partial"
    assert len(result.candidate_change_set_ids) == 1
    assert result.failed_candidate_count == 1
    assert BuilderGenerationStatus(str(record.status)) == BuilderGenerationStatus.PARTIAL
    assert record.failures[0]["code"] == "BUILDER_GENERATION_OUTPUT_INVALID"


@pytest.mark.asyncio
async def test_handler_all_failed_is_an_explicit_domain_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    record = _record(candidate_count=2)
    repository = _Repository(record)
    generator = _Generator([
        BuilderSitemapGeneratorError(
            "BUILDER_GENERATION_OUTPUT_INVALID",
            continue_candidates=True,
        ),
        BuilderSitemapGeneratorError(
            "BUILDER_GENERATION_OUTPUT_INVALID",
            continue_candidates=True,
        ),
    ])
    context = _Context(record=record)
    preview_calls, _ = _install_preview(monkeypatch)
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=generator,
    )

    result = await handler.execute(context=_job_context(context))

    assert isinstance(result, JobHandledFailure)
    assert result.code == BUILDER_GENERATION_FAILED_CODE
    assert result.metadata == {
        "publicErrorCode": "BUILDER_GENERATION_FAILED",
        "failedCandidateCount": 2,
    }
    assert BuilderGenerationStatus(str(record.status)) == BuilderGenerationStatus.FAILED
    assert preview_calls == []


@pytest.mark.asyncio
async def test_provider_failure_stops_remaining_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    record = _record(candidate_count=3)
    repository = _Repository(record)
    generator = _Generator([
        BuilderSitemapGeneratorError(
            "BUILDER_GENERATION_PROVIDER_FAILED",
            continue_candidates=False,
        ),
        _candidate("must-not-run"),
    ])
    context = _Context(record=record)
    _install_preview(monkeypatch)
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=generator,
    )

    result = await handler.execute(context=_job_context(context))

    assert isinstance(result, JobHandledFailure)
    assert len(generator.requests) == 1
    assert context.checkpoint_count == 1
    assert record.failures[0]["code"] == "BUILDER_GENERATION_PROVIDER_FAILED"


@pytest.mark.asyncio
async def test_replay_skips_an_existing_candidate_and_does_not_preview_twice(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing_change_set_id = uuid4()
    record = _record(
        candidate_count=1,
        candidates=[
            {
                "candidateIndex": 0,
                "changeSetId": str(existing_change_set_id),
                "commandKey": "existing-preview",
            }
        ],
    )
    repository = _Repository(record)
    generator = _Generator([])
    context = _Context(record=record)
    preview_calls, _ = _install_preview(monkeypatch)
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=generator,
    )

    result = await handler.execute(context=_job_context(context))

    assert isinstance(result, BuilderGenerationJobResult)
    assert result.status == "succeeded"
    assert result.candidate_change_set_ids == (existing_change_set_id,)
    assert generator.requests == []
    assert preview_calls == []


@pytest.mark.asyncio
async def test_cancel_retains_existing_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    candidate_id = uuid4()
    record = _record(
        candidate_count=2,
        candidates=[
            {
                "candidateIndex": 0,
                "changeSetId": str(candidate_id),
                "commandKey": "existing-preview",
            }
        ],
    )
    repository = _Repository(record)
    context = _Context(record=record)
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=_Generator([]),
    )

    await handler.cancel(context=_job_context(context))

    assert BuilderGenerationStatus(str(record.status)) == BuilderGenerationStatus.CANCELLED
    assert record.candidates[0]["changeSetId"] == str(candidate_id)


@pytest.mark.asyncio
async def test_reconcile_returns_the_persisted_terminal_result(monkeypatch: pytest.MonkeyPatch) -> None:
    candidate_id = uuid4()
    record = _record(
        candidate_count=1,
        status=BuilderGenerationStatus.SUCCEEDED,
        candidates=[
            {
                "candidateIndex": 0,
                "changeSetId": str(candidate_id),
                "commandKey": "existing-preview",
            }
        ],
    )
    repository = _Repository(record)
    context = _Context(record=record)
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=_Generator([]),
    )

    result = await handler.reconcile(context=_job_context(context))

    assert isinstance(result, BuilderGenerationJobResult)
    assert result.candidate_change_set_ids == (candidate_id,)


@pytest.mark.asyncio
async def test_lost_fence_prevents_candidate_projection(monkeypatch: pytest.MonkeyPatch) -> None:
    record = _record(candidate_count=1)
    repository = _Repository(record)
    context = _Context(record=record)
    context.reject_fenced_commits = True
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=_Generator([]),
    )

    with pytest.raises(PermanentJobExecutionError, match="lease lost"):
        await handler._record_candidate(
            context=context,
            candidate_index=0,
            change_set_id=uuid4(),
            command_key="candidate-preview",
        )

    assert record.candidates == []
    assert repository.updates == []


def _handler(
    *,
    monkeypatch: pytest.MonkeyPatch,
    repository: _Repository,
    generator: _Generator,
) -> BuilderGenerationJobHandler:
    builder_repository = SimpleNamespace(
        tenant_context=SimpleNamespace(
            identity=SimpleNamespace(organization_id=uuid4()),
        )
    )
    handler = BuilderGenerationJobHandler(
        settings=get_settings(),
        repository_factory=lambda: cast(BuilderGenerationRepository, repository),
        builder_repository_factory=lambda: cast(SiteBuilderRepository, builder_repository),
        design_system_repository_factory=lambda: cast(ProjectDesignSystemsRepository, object()),
        component_catalog_resolver=get_official_component_catalog_registry(),
        generator=cast(BuilderSitemapGenerator, generator),
        wireframe_generator=cast(BuilderWireframeGenerator, SimpleNamespace()),
    )

    async def state(context):  # type: ignore[no-untyped-def]
        _ = context
        candidates = tuple(
            generation_handler._CandidateReference.model_validate(item) for item in repository.record.candidates
        )
        failures = tuple(BuilderGenerationFailureOut.model_validate(item) for item in repository.record.failures)
        return generation_handler._ExecutionState(
            record=repository.record,
            builder_context=AgentRunBuilderContextV1.model_construct(),
            planning_context=None,
            composition_context=None,
            design_context=None,
            agent_instructions="Act as the Site Architect.",
            candidates=candidates,
            failures=failures,
        )

    monkeypatch.setattr(handler, "_state", state)
    return handler


def _job_context(
    context: _Context,
) -> JobExecutionContext[BuilderGenerationJobTarget, BuilderGenerationJobInput]:
    return cast(JobExecutionContext[BuilderGenerationJobTarget, BuilderGenerationJobInput], context)


def _install_preview(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    calls: list[dict[str, object]] = []
    change_set_ids: list[UUID] = []

    async def preview(_service, **kwargs):  # type: ignore[no-untyped-def]
        calls.append(kwargs)
        change_set_id = uuid4()
        change_set_ids.append(change_set_id)
        return SimpleNamespace(change_set_id=change_set_id)

    monkeypatch.setattr(generation_handler.SiteBuilderChangeSetService, "preview", preview)
    return calls, change_set_ids


def _candidate(client_page_id: str) -> BuilderSitemapCandidateV1:
    return BuilderSitemapCandidateV1(
        summary=f"Create {client_page_id}",
        operations=(
            BuilderPageCreateOperationV1(
                operation_id=f"create-{client_page_id}",
                type="page.create",
                client_page_id=client_page_id,
                model_key="page",
                title=client_page_id.title(),
                slug=client_page_id,
                locale="en-US",
                sort_order=0,
                path="/" if client_page_id == "home" else f"/{client_page_id}",
                fields_snapshot={},
            ),
        ),
    )


def _record(
    *,
    candidate_count: int,
    status: BuilderGenerationStatus = BuilderGenerationStatus.QUEUED,
    candidates: list[dict[str, object]] | None = None,
) -> BuilderGenerationRecord:
    return BuilderGenerationRecord(
        id=uuid4(),
        workspace_id=uuid4(),
        project_id=uuid4(),
        runtime_id=uuid4(),
        site_id=uuid4(),
        environment_id=uuid4(),
        base_site_revision_id=uuid4(),
        base_manifest_hash="sha256:" + "a" * 64,
        base_etag="sha256:" + "b" * 64,
        job_id=uuid4(),
        actor_user_id=uuid4(),
        agent_run_id=uuid4(),
        tool_name="builder.sitemap.generate",
        target_stage="sitemap",
        objective="Create a product-ready sitemap.",
        locale="en-US",
        candidate_count=candidate_count,
        targets=[],
        knowledge_reference_ids=[],
        builder_context=None,
        composition_context=None,
        request_fingerprint="f" * 64,
        status=status,
        candidates=candidates or [],
        failures=[],
    )
