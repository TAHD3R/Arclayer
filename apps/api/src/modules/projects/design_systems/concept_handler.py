from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import NoReturn, cast
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.design_systems._enums import (
    DesignSystemConceptGenerationStatus,
    DesignSystemOwnerKind,
)
from src.models.design_systems.concept_generation import DesignSystemConceptGenerationRecord
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.ai.agent_tool_grants import BUILDER_STYLE_GUIDE_GENERATE_TOOL
from src.modules.jobs.execution_errors import (
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
)
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandledFailure
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.concept_job_contract import (
    DESIGN_SYSTEM_CONCEPT_GENERATION_FAILED_CODE,
    DesignSystemConceptGenerationFailureMetadata,
    DesignSystemConceptGenerationJobInput,
    DesignSystemConceptGenerationJobResult,
    DesignSystemConceptGenerationJobTarget,
)
from src.modules.projects.design_systems.concept_provider import (
    DesignSystemConceptGenerationRequest,
    DesignSystemConceptGenerator,
    DesignSystemConceptGeneratorError,
)
from src.modules.projects.design_systems.concept_repository import DesignSystemConceptGenerationRepository
from src.modules.projects.design_systems.concept_schema import (
    AgentDesignSystemConceptVersionCreate,
    DesignSystemConceptGenerationFailureOut,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.version_service import ProjectDesignSystemVersionService


class _CandidateReference(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    candidate_index: int = Field(ge=0)
    summary: str = Field(min_length=1, max_length=1000)
    version_id: UUID
    validation_id: UUID


class _ExecutionState(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
    )

    record: DesignSystemConceptGenerationRecord
    design_system_context: AgentRunDesignSystemContextV1
    agent_instructions: str = Field(min_length=1)
    candidates: tuple[_CandidateReference, ...]
    failures: tuple[DesignSystemConceptGenerationFailureOut, ...]


class DesignSystemConceptGenerationJobHandler:
    def __init__(
        self,
        *,
        settings: Settings,
        repository_factory: Callable[[], DesignSystemConceptGenerationRepository],
        design_system_repository_factory: Callable[[], ProjectDesignSystemsRepository],
        builder_repository_factory: Callable[[], SiteBuilderRepository],
        version_service_factory: Callable[[], ProjectDesignSystemVersionService],
        generator: DesignSystemConceptGenerator,
        agent_catalog_service: AgentCatalogService | None = None,
    ) -> None:
        self._settings = settings
        self._repository_factory = repository_factory
        self._design_system_repository_factory = design_system_repository_factory
        self._builder_repository_factory = builder_repository_factory
        self._version_service_factory = version_service_factory
        self._generator = generator
        self._agents = agent_catalog_service or AgentCatalogService(settings)

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[
            DesignSystemConceptGenerationJobTarget,
            DesignSystemConceptGenerationJobInput,
        ],
    ) -> DesignSystemConceptGenerationJobResult | JobHandledFailure | None:
        state = await self._state(context)
        status = DesignSystemConceptGenerationStatus(str(state.record.status))
        if status in {
            DesignSystemConceptGenerationStatus.SUCCEEDED,
            DesignSystemConceptGenerationStatus.PARTIAL,
        }:
            return self._result(state)
        if status is DesignSystemConceptGenerationStatus.FAILED:
            return self._failure(state, DESIGN_SYSTEM_CONCEPT_GENERATION_FAILED_CODE)
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[
            DesignSystemConceptGenerationJobTarget,
            DesignSystemConceptGenerationJobInput,
        ],
    ) -> DesignSystemConceptGenerationJobResult | JobHandledFailure:
        actor_user_id = context.actor_user_id
        if actor_user_id is None:
            raise PermanentJobExecutionError(
                code="BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH",
                safe_message="Design System concept generation requires its persisted actor",
            )
        state = await self._state(context)
        total = state.record.candidate_count * 2 + 2
        await context.report_progress(_progress("preparing", 0, total))
        await self._mark_running(context=context)
        completed = 1
        await context.report_progress(_progress("preparing", completed, total))
        for candidate_index in range(state.record.candidate_count):
            await context.checkpoint()
            state = await self._state(context)
            if any(item.candidate_index == candidate_index for item in state.candidates):
                completed += 2
                continue
            await context.report_progress(_progress("generating", completed, total))
            try:
                candidate = await self._generator.generate(
                    request=DesignSystemConceptGenerationRequest(
                        workspace_id=state.record.workspace_id,
                        project_id=state.record.project_id,
                        actor_user_id=actor_user_id,
                        agent_run_id=state.record.agent_run_id,
                        correlation_id=state.record.id.hex,
                        candidate_index=candidate_index,
                        objective=state.record.objective,
                        locale=state.record.locale,
                        agent_instructions=state.agent_instructions,
                        design_system_context=state.design_system_context,
                    )
                )
            except DesignSystemConceptGeneratorError as error:
                await self._record_failure(context=context, candidate_index=candidate_index, code=error.code)
                completed += 2
                if not error.continue_candidates:
                    break
                continue
            completed += 1
            await context.report_progress(_progress("validating", completed, total))
            created = await self._version_service_factory().create_agent_concept_version(
                workspace_id=state.record.workspace_id,
                organization_id=self._design_system_repository_factory().tenant_context.identity.organization_id,
                project_id=state.record.project_id,
                system_id=state.record.design_system_id,
                actor_user_id=actor_user_id,
                idempotency_key=context.idempotency_key(step=f"candidate-{candidate_index}-version"),
                payload=AgentDesignSystemConceptVersionCreate(
                    generation_id=state.record.id,
                    candidate_index=candidate_index,
                    base_version_id=state.record.base_version_id,
                    expected_base_checksum=state.record.base_manifest_checksum,
                    agent_run_id=state.record.agent_run_id,
                    agent_id=state.record.agent_id,
                    agent_version_id=state.record.agent_version_id,
                    agent_assignment_id=state.record.agent_assignment_id,
                    summary=candidate.summary,
                    manifest=candidate.manifest,
                ),
            )
            await self._record_candidate(
                context=context,
                candidate_index=candidate_index,
                summary=candidate.summary,
                version_id=UUID(str(created.version.id)),
                validation_id=UUID(str(created.validation.id)),
            )
            completed += 1
        await context.report_progress(_progress("finalizing", min(completed, total - 1), total))
        state = await self._state(context)
        if not state.candidates:
            await self._mark_terminal(context=context, status=DesignSystemConceptGenerationStatus.FAILED)
            return self._failure(state, DESIGN_SYSTEM_CONCEPT_GENERATION_FAILED_CODE)
        terminal = (
            DesignSystemConceptGenerationStatus.PARTIAL
            if state.failures or len(state.candidates) < state.record.candidate_count
            else DesignSystemConceptGenerationStatus.SUCCEEDED
        )
        await self._mark_terminal(context=context, status=terminal)
        await context.report_progress(_progress("finalizing", total, total))
        return self._result(await self._state(context))

    async def cancel(
        self,
        *,
        context: JobExecutionContext[
            DesignSystemConceptGenerationJobTarget,
            DesignSystemConceptGenerationJobInput,
        ],
    ) -> None:
        await self._mark_terminal(context=context, status=DesignSystemConceptGenerationStatus.CANCELLED)

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[
            DesignSystemConceptGenerationJobTarget,
            DesignSystemConceptGenerationJobInput,
        ],
        error: PermanentJobExecutionError | TransientJobExecutionError | UnexpectedJobExecutionError,
    ) -> JobHandledFailure | None:
        await self._mark_terminal(context=context, status=DesignSystemConceptGenerationStatus.FAILED)
        return self._failure(await self._state(context), error.code)

    async def _state(
        self,
        context: JobExecutionContext[
            DesignSystemConceptGenerationJobTarget,
            DesignSystemConceptGenerationJobInput,
        ],
    ) -> _ExecutionState:
        repository = self._repository_factory()
        design_systems = self._design_system_repository_factory()
        builder = self._builder_repository_factory()
        record = await repository.get_generation(
            project_id=context.target.project_id,
            design_system_id=context.target.design_system_id,
            generation_id=context.input_reference.generation_id,
        )
        if not _matches_job(record=record, context=context):
            _raise_contract_mismatch("Design System concept generation record does not match its canonical Job")
        assert record is not None
        if (
            record.agent_id is None
            or record.agent_version_id is None
            or record.agent_assignment_id is None
            or not isinstance(record.design_system_context, dict)
            or not isinstance(record.builder_context, dict)
        ):
            _raise_contract_mismatch("Design System concept generation Agent snapshots are unavailable")
        design_context = AgentRunDesignSystemContextV1.model_validate(record.design_system_context)
        builder_context = AgentRunBuilderContextV1.model_validate(record.builder_context)
        resolved_agent, _ = await self._agents.validate_run_snapshot(
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            lead_agent_id=record.agent_id,
            lead_agent_version_id=record.agent_version_id,
            lead_agent_assignment_id=record.agent_assignment_id,
            mentioned_agent_ids=(),
            mentioned_agent_version_ids=(),
            mentioned_agent_assignment_ids=(),
            execution_mode="build",
        )
        async with design_systems.connection() as conn:
            system = await design_systems.get_system(
                workspace_id=record.workspace_id,
                system_id=record.design_system_id,
                conn=conn,
            )
            base_version = await design_systems.get_version(
                workspace_id=record.workspace_id,
                system_id=record.design_system_id,
                version_id=record.base_version_id,
                conn=conn,
            )
            assignment = await design_systems.get_assignment(project_id=record.project_id, conn=conn)
        revision = await builder.get_site_revision(
            project_id=record.project_id,
            revision_id=record.base_site_revision_id,
            conn=None,
        )
        latest = (
            await builder.get_latest_site_revision(
                project_id=record.project_id,
                site_id=revision.site_id,
                environment_id=revision.environment_id,
                conn=None,
            )
            if revision is not None
            else None
        )
        if (
            system is None
            or DesignSystemOwnerKind(str(system.owner_kind)) is not DesignSystemOwnerKind.PROJECT
            or system.owning_project_id != record.project_id
            or base_version is None
            or base_version.manifest_checksum != record.base_manifest_checksum
            or assignment is None
            or assignment.design_system_id != record.design_system_id
            or assignment.design_system_version_id != record.base_version_id
            or assignment.manifest_checksum != record.base_manifest_checksum
            or revision is None
            or latest is None
            or latest.id != revision.id
            or revision.manifest_hash != record.base_etag
            or design_context.version_id != record.base_version_id
            or design_context.manifest_checksum != record.base_manifest_checksum
            or builder_context.site_revision_id != record.base_site_revision_id
            or builder_context.manifest_hash != record.base_etag
            or BUILDER_STYLE_GUIDE_GENERATE_TOOL not in resolved_agent.tool_grants
            or not resolved_agent.instructions.strip()
        ):
            _raise_contract_mismatch("Design System concept generation authority changed before execution")
        return _ExecutionState(
            record=record,
            design_system_context=design_context,
            agent_instructions=resolved_agent.instructions.strip(),
            candidates=tuple(_CandidateReference.model_validate(item) for item in record.candidates),
            failures=tuple(DesignSystemConceptGenerationFailureOut.model_validate(item) for item in record.failures),
        )

    async def _mark_running(self, *, context) -> None:
        async def commit() -> None:
            record = await self._locked(context)
            if DesignSystemConceptGenerationStatus(str(record.status)) is DesignSystemConceptGenerationStatus.QUEUED:
                await self._repository_factory().update_generation(
                    record=record,
                    values={"status": DesignSystemConceptGenerationStatus.RUNNING, "started_at": datetime.now(UTC)},
                    conn=None,
                )

        await context.run_fenced_domain_commit(commit)

    async def _record_candidate(
        self,
        *,
        context,
        candidate_index: int,
        summary: str,
        version_id: UUID,
        validation_id: UUID,
    ) -> None:
        async def commit() -> None:
            record = await self._locked(context)
            current = list(record.candidates)
            if any(item.get("candidateIndex") == candidate_index for item in current if isinstance(item, dict)):
                return
            current.append(
                _CandidateReference(
                    candidate_index=candidate_index,
                    summary=summary,
                    version_id=version_id,
                    validation_id=validation_id,
                ).model_dump(mode="json", by_alias=True)
            )
            await self._repository_factory().update_generation(
                record=record,
                values={"candidates": current},
                conn=None,
            )

        await context.run_fenced_domain_commit(commit)

    async def _record_failure(self, *, context, candidate_index: int, code: str) -> None:
        async def commit() -> None:
            record = await self._locked(context)
            current = list(record.failures)
            if any(item.get("candidateIndex") == candidate_index for item in current if isinstance(item, dict)):
                return
            current.append(
                DesignSystemConceptGenerationFailureOut(
                    candidate_index=candidate_index,
                    code=code,
                    message_key=code,
                ).model_dump(mode="json", by_alias=True)
            )
            await self._repository_factory().update_generation(record=record, values={"failures": current}, conn=None)

        await context.run_fenced_domain_commit(commit)

    async def _mark_terminal(self, *, context, status: DesignSystemConceptGenerationStatus) -> None:
        async def commit() -> None:
            record = await self._locked(context)
            if DesignSystemConceptGenerationStatus(str(record.status)) in _TERMINAL_STATUSES:
                return
            await self._repository_factory().update_generation(
                record=record,
                values={"status": status, "terminal_at": datetime.now(UTC)},
                conn=None,
            )

        await context.run_fenced_domain_commit(commit)

    async def _locked(self, context) -> DesignSystemConceptGenerationRecord:
        record = await self._repository_factory().get_generation(
            project_id=context.target.project_id,
            design_system_id=context.target.design_system_id,
            generation_id=context.input_reference.generation_id,
            conn=None,
            for_update=True,
        )
        if record is None or record.job_id != context.lease.job_id:
            _raise_contract_mismatch("Design System concept generation record is unavailable under its fence")
        return record

    @staticmethod
    def _result(state: _ExecutionState) -> DesignSystemConceptGenerationJobResult:
        status = DesignSystemConceptGenerationStatus(str(state.record.status))
        return DesignSystemConceptGenerationJobResult(
            generation_id=state.record.id,
            base_version_id=state.record.base_version_id,
            status="partial" if status is DesignSystemConceptGenerationStatus.PARTIAL else "succeeded",
            candidate_version_ids=tuple(item.version_id for item in state.candidates),
            failed_candidate_count=len(state.failures),
        )

    @staticmethod
    def _failure(state: _ExecutionState, public_error_code: str) -> JobHandledFailure:
        metadata = DesignSystemConceptGenerationFailureMetadata(
            public_error_code=public_error_code,
            failed_candidate_count=max(len(state.failures), 1),
        )
        return JobHandledFailure(
            code=DESIGN_SYSTEM_CONCEPT_GENERATION_FAILED_CODE,
            safe_message="Design System concept generation did not produce a typed candidate",
            metadata=cast(JsonObject, metadata.model_dump(mode="json", by_alias=True)),
        )


_TERMINAL_STATUSES = frozenset({
    DesignSystemConceptGenerationStatus.SUCCEEDED,
    DesignSystemConceptGenerationStatus.PARTIAL,
    DesignSystemConceptGenerationStatus.FAILED,
    DesignSystemConceptGenerationStatus.CANCELLED,
})


def _matches_job(*, record, context) -> bool:
    return bool(
        record is not None
        and record.job_id == context.lease.job_id
        and record.workspace_id == context.target.workspace_id
        and record.project_id == context.target.project_id
        and record.design_system_id == context.target.design_system_id
        and record.base_version_id == context.input_reference.base_version_id
        and record.base_site_revision_id == context.input_reference.base_site_revision_id
        and record.agent_run_id == context.input_reference.agent_run_id
        and record.agent_version_id == context.input_reference.agent_version_id
        and record.actor_user_id == context.actor_user_id
        and record.request_fingerprint == context.input_reference.request_hash
        and record.base_manifest_checksum == context.source_revision
    )


def _raise_contract_mismatch(message: str) -> NoReturn:
    raise PermanentJobExecutionError(
        code="BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH",
        safe_message=message,
    )


def _progress(phase: str, completed: int, total: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"DESIGN_SYSTEM_CONCEPT_GENERATION_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=total,
    )
