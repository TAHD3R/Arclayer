from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.models.design_systems._enums import DesignSystemConceptGenerationStatus
from src.models.design_systems.concept_generation import DesignSystemConceptGenerationRecord
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandledFailure
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems import concept_handler
from src.modules.projects.design_systems.concept_handler import DesignSystemConceptGenerationJobHandler
from src.modules.projects.design_systems.concept_job_contract import (
    DesignSystemConceptGenerationJobInput,
    DesignSystemConceptGenerationJobResult,
    DesignSystemConceptGenerationJobTarget,
)
from src.modules.projects.design_systems.concept_provider import (
    DesignSystemConceptCandidateV1,
    DesignSystemConceptGenerator,
    DesignSystemConceptGeneratorError,
)
from src.modules.projects.design_systems.concept_repository import (
    DesignSystemConceptGenerationRepository,
)
from src.modules.projects.design_systems.concept_schema import (
    AgentDesignSystemConceptVersionCreate,
    DesignSystemConceptGenerationFailureOut,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.version_service import ProjectDesignSystemVersionService
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestInputV1

pytestmark = pytest.mark.unit


class _Context:
    def __init__(self, *, record: DesignSystemConceptGenerationRecord) -> None:
        self.lease = SimpleNamespace(job_id=record.job_id, attempt_id=uuid4(), attempt_number=1)
        self.target = DesignSystemConceptGenerationJobTarget(
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            design_system_id=record.design_system_id,
        )
        self.input_reference = DesignSystemConceptGenerationJobInput(
            generation_id=record.id,
            base_version_id=record.base_version_id,
            base_site_revision_id=record.base_site_revision_id,
            agent_run_id=record.agent_run_id,
            agent_version_id=record.agent_version_id,
            request_hash=record.request_fingerprint,
        )
        self.actor_user_id = record.actor_user_id
        self.source_revision = record.base_manifest_checksum
        self.request_fingerprint = record.request_fingerprint
        self.progress = []
        self.checkpoint_count = 0
        self.fenced_commit_count = 0
        self.reject_fenced_commits = False

    def idempotency_key(self, *, step: str) -> str:
        return f"concept:{self.input_reference.generation_id}:{step}"

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
    def __init__(self, record: DesignSystemConceptGenerationRecord) -> None:
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
            setattr(record, key, value)
        return record


class _Generator:
    def __init__(
        self,
        outcomes: list[DesignSystemConceptCandidateV1 | DesignSystemConceptGeneratorError],
    ) -> None:
        self.outcomes = list(outcomes)
        self.requests = []

    async def generate(self, *, request):  # type: ignore[no-untyped-def]
        self.requests.append(request)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, DesignSystemConceptGeneratorError):
            raise outcome
        return outcome


class _VersionService:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.version_ids: list[UUID] = []

    async def create_agent_concept_version(self, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(kwargs)
        version_id = uuid4()
        validation_id = uuid4()
        self.version_ids.append(version_id)
        return SimpleNamespace(
            candidate_index=kwargs["payload"].candidate_index,
            summary=kwargs["payload"].summary,
            version=SimpleNamespace(id=version_id),
            validation=SimpleNamespace(id=validation_id),
        )


@pytest.mark.asyncio
async def test_handler_persists_typed_concept_versions_and_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    record = _record(candidate_count=2)
    repository = _Repository(record)
    generator = _Generator([_candidate("Editorial Warm"), _candidate("Editorial Modern")])
    versions = _VersionService()
    context = _Context(record=record)
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=generator,
        versions=versions,
    )

    result = await handler.execute(context=_job_context(context))

    assert isinstance(result, DesignSystemConceptGenerationJobResult)
    assert result.status == "succeeded"
    assert result.candidate_version_ids == tuple(versions.version_ids)
    assert result.failed_candidate_count == 0
    assert DesignSystemConceptGenerationStatus(str(record.status)) is DesignSystemConceptGenerationStatus.SUCCEEDED
    payloads = [cast(AgentDesignSystemConceptVersionCreate, call["payload"]) for call in versions.calls]
    assert [payload.base_version_id for payload in payloads] == [record.base_version_id] * 2
    assert [payload.candidate_index for payload in payloads] == [0, 1]
    assert context.checkpoint_count == 2
    assert context.progress[-1].phase == "finalizing"
    assert context.progress[-1].progress_completed == context.progress[-1].progress_total


@pytest.mark.asyncio
async def test_handler_preserves_a_valid_candidate_when_another_candidate_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    record = _record(candidate_count=2)
    repository = _Repository(record)
    generator = _Generator([
        _candidate("Editorial Warm"),
        DesignSystemConceptGeneratorError(
            "DESIGN_SYSTEM_CONCEPT_OUTPUT_INVALID",
            continue_candidates=True,
        ),
    ])
    versions = _VersionService()
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=generator,
        versions=versions,
    )

    result = await handler.execute(context=_job_context(_Context(record=record)))

    assert isinstance(result, DesignSystemConceptGenerationJobResult)
    assert result.status == "partial"
    assert result.candidate_version_ids == tuple(versions.version_ids)
    assert result.failed_candidate_count == 1
    assert record.failures[0]["code"] == "DESIGN_SYSTEM_CONCEPT_OUTPUT_INVALID"


@pytest.mark.asyncio
async def test_provider_failure_stops_remaining_concept_candidates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    record = _record(candidate_count=3)
    repository = _Repository(record)
    generator = _Generator([
        DesignSystemConceptGeneratorError(
            "DESIGN_SYSTEM_CONCEPT_PROVIDER_FAILED",
            continue_candidates=False,
        ),
        _candidate("Must not run"),
    ])
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=generator,
        versions=_VersionService(),
    )

    result = await handler.execute(context=_job_context(_Context(record=record)))

    assert isinstance(result, JobHandledFailure)
    assert len(generator.requests) == 1
    assert record.failures[0]["code"] == "DESIGN_SYSTEM_CONCEPT_PROVIDER_FAILED"
    assert DesignSystemConceptGenerationStatus(str(record.status)) is DesignSystemConceptGenerationStatus.FAILED


@pytest.mark.asyncio
async def test_replay_skips_an_existing_concept_candidate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    version_id = uuid4()
    record = _record(
        candidate_count=1,
        candidates=[
            {
                "candidateIndex": 0,
                "summary": "Existing concept",
                "versionId": str(version_id),
                "validationId": str(uuid4()),
            }
        ],
    )
    repository = _Repository(record)
    generator = _Generator([])
    versions = _VersionService()
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=generator,
        versions=versions,
    )

    result = await handler.execute(context=_job_context(_Context(record=record)))

    assert isinstance(result, DesignSystemConceptGenerationJobResult)
    assert result.candidate_version_ids == (version_id,)
    assert generator.requests == []
    assert versions.calls == []


@pytest.mark.asyncio
async def test_cancel_retains_existing_concept_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    version_id = uuid4()
    record = _record(
        candidate_count=2,
        candidates=[
            {
                "candidateIndex": 0,
                "summary": "Existing concept",
                "versionId": str(version_id),
                "validationId": str(uuid4()),
            }
        ],
    )
    repository = _Repository(record)
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=_Generator([]),
        versions=_VersionService(),
    )

    await handler.cancel(context=_job_context(_Context(record=record)))

    assert DesignSystemConceptGenerationStatus(str(record.status)) is DesignSystemConceptGenerationStatus.CANCELLED
    assert record.candidates[0]["versionId"] == str(version_id)


@pytest.mark.asyncio
async def test_lost_fence_prevents_concept_candidate_projection(monkeypatch: pytest.MonkeyPatch) -> None:
    record = _record(candidate_count=1)
    repository = _Repository(record)
    context = _Context(record=record)
    context.reject_fenced_commits = True
    handler = _handler(
        monkeypatch=monkeypatch,
        repository=repository,
        generator=_Generator([]),
        versions=_VersionService(),
    )

    with pytest.raises(PermanentJobExecutionError, match="lease lost"):
        await handler._record_candidate(
            context=context,
            candidate_index=0,
            summary="Must not persist",
            version_id=uuid4(),
            validation_id=uuid4(),
        )

    assert record.candidates == []
    assert repository.updates == []


def _handler(
    *,
    monkeypatch: pytest.MonkeyPatch,
    repository: _Repository,
    generator: _Generator,
    versions: _VersionService,
) -> DesignSystemConceptGenerationJobHandler:
    design_system_repository = SimpleNamespace(
        tenant_context=SimpleNamespace(identity=SimpleNamespace(organization_id=uuid4()))
    )
    handler = DesignSystemConceptGenerationJobHandler(
        settings=get_settings(),
        repository_factory=lambda: cast(DesignSystemConceptGenerationRepository, repository),
        design_system_repository_factory=lambda: cast(
            ProjectDesignSystemsRepository,
            design_system_repository,
        ),
        builder_repository_factory=lambda: cast(SiteBuilderRepository, object()),
        version_service_factory=lambda: cast(ProjectDesignSystemVersionService, versions),
        generator=cast(DesignSystemConceptGenerator, generator),
    )

    async def state(context):  # type: ignore[no-untyped-def]
        _ = context
        candidates = tuple(
            concept_handler._CandidateReference.model_validate(item) for item in repository.record.candidates
        )
        return concept_handler._ExecutionState(
            record=repository.record,
            design_system_context=AgentRunDesignSystemContextV1.model_construct(),
            agent_instructions="Create accessible, distinctive Style Guides.",
            candidates=candidates,
            failures=tuple(
                DesignSystemConceptGenerationFailureOut.model_validate(item) for item in repository.record.failures
            ),
        )

    monkeypatch.setattr(handler, "_state", state)
    return handler


def _job_context(
    context: _Context,
) -> JobExecutionContext[DesignSystemConceptGenerationJobTarget, DesignSystemConceptGenerationJobInput]:
    return cast(
        JobExecutionContext[DesignSystemConceptGenerationJobTarget, DesignSystemConceptGenerationJobInput],
        context,
    )


def _candidate(summary: str) -> DesignSystemConceptCandidateV1:
    manifest = DesignSystemManifestInputV1.model_validate({
        "manifestVersion": 1,
        "name": summary,
        "primitiveTokens": {
            "primitive.color.action": {"type": "color", "value": "#7C3AED"},
            "primitive.color.on-action": {"type": "color", "value": "#FFFFFF"},
        },
        "semanticTokens": {
            "semantic.color.action.primary": {
                "type": "color",
                "alias": "primitive.color.action",
            },
            "semantic.color.action.on-primary": {
                "type": "color",
                "alias": "primitive.color.on-action",
            },
        },
        "componentTokens": {},
        "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        "typographyRoles": [],
        "componentRecipes": [],
        "motionTokens": [],
        "breakpoints": {},
        "assetReferences": [],
        "componentCatalogVersion": "arclayer-wireframe-v1",
        "extensions": {},
    })
    return DesignSystemConceptCandidateV1(
        summary=summary,
        manifest=manifest,
    )


def _record(
    *,
    candidate_count: int,
    candidates: list[dict[str, object]] | None = None,
) -> DesignSystemConceptGenerationRecord:
    return DesignSystemConceptGenerationRecord(
        id=uuid4(),
        workspace_id=uuid4(),
        project_id=uuid4(),
        design_system_id=uuid4(),
        base_version_id=uuid4(),
        base_manifest_checksum="sha256:" + "a" * 64,
        base_site_revision_id=uuid4(),
        base_etag="sha256:" + "b" * 64,
        job_id=uuid4(),
        actor_user_id=uuid4(),
        agent_run_id=uuid4(),
        agent_id=uuid4(),
        agent_version_id=uuid4(),
        agent_assignment_id=uuid4(),
        design_system_context={},
        builder_context={},
        tool_name="builder.style_guide.generate",
        objective="Create two distinctive editorial Style Guide directions.",
        locale="en-US",
        candidate_count=candidate_count,
        request_fingerprint="f" * 64,
        status=DesignSystemConceptGenerationStatus.QUEUED,
        candidates=candidates or [],
        failures=[],
    )
