from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import NoReturn, cast
from uuid import UUID

from pydantic import ConfigDict, Field, ValidationError

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.builder._enums import BuilderGenerationStatus
from src.models.builder.generation import BuilderGenerationRecord
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_tool_grants import (
    BUILDER_DESIGN_APPLY_TOOL,
    BUILDER_DESIGN_GENERATE_TOOL,
    BUILDER_SITEMAP_APPLY_TOOL,
    BUILDER_SITEMAP_GENERATE_TOOL,
    BUILDER_WIREFRAME_APPLY_TOOL,
    BUILDER_WIREFRAME_GENERATE_TOOL,
)
from src.modules.jobs.execution_errors import (
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
)
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandledFailure
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.projects.builder.change_set_schema import BuilderChangeSetPreviewRequest
from src.modules.projects.builder.change_set_service import SiteBuilderChangeSetService
from src.modules.projects.builder.composition_saga_job_contract import (
    BuilderPlanningGenerationJobInput,
    BuilderPlanningGenerationJobResult,
)
from src.modules.projects.builder.composition_saga_projection import BuilderCompositionSagaChildProjector
from src.modules.projects.builder.composition_saga_provider import (
    BuilderPlanningGenerationContextV1,
    BuilderPlanningGenerationRequest,
    BuilderPlanningGenerator,
)
from src.modules.projects.builder.generation_job_contract import (
    BUILDER_GENERATION_FAILED_CODE,
    BuilderDesignGenerationJobInput,
    BuilderDesignGenerationJobResult,
    BuilderGenerationFailureMetadata,
    BuilderGenerationJobInput,
    BuilderGenerationJobResult,
    BuilderGenerationJobTarget,
    BuilderWireframeGenerationJobInput,
    BuilderWireframeGenerationJobResult,
)
from src.modules.projects.builder.generation_provider import (
    BuilderDesignGenerationContextV1,
    BuilderDesignGenerationRequest,
    BuilderDesignGenerator,
    BuilderSitemapGenerationRequest,
    BuilderSitemapGenerator,
    BuilderSitemapGeneratorError,
    BuilderWireframeGenerationContextV1,
    BuilderWireframeGenerationRequest,
    BuilderWireframeGenerator,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import (
    BuilderGenerationFailureOut,
    BuilderGenerationTargetV1,
)
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver

_GenerationJobInput = (
    BuilderGenerationJobInput
    | BuilderPlanningGenerationJobInput
    | BuilderWireframeGenerationJobInput
    | BuilderDesignGenerationJobInput
)


class _CandidateReference(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    candidate_index: int = Field(ge=0)
    change_set_id: UUID
    command_key: str = Field(min_length=1, max_length=128)


class _ExecutionState(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
    )

    record: BuilderGenerationRecord
    builder_context: AgentRunBuilderContextV1 | None
    planning_context: BuilderPlanningGenerationContextV1 | None
    composition_context: BuilderWireframeGenerationContextV1 | None
    design_context: BuilderDesignGenerationContextV1 | None
    agent_instructions: str = Field(min_length=1)
    candidates: tuple[_CandidateReference, ...]
    failures: tuple[BuilderGenerationFailureOut, ...]


class BuilderGenerationJobHandler:
    def __init__(
        self,
        *,
        settings: Settings,
        repository_factory: Callable[[], BuilderGenerationRepository],
        builder_repository_factory: Callable[[], SiteBuilderRepository],
        design_system_repository_factory: Callable[[], ProjectDesignSystemsRepository],
        component_catalog_resolver: ComponentCatalogResolver,
        generator: BuilderSitemapGenerator,
        wireframe_generator: BuilderWireframeGenerator,
        design_generator: BuilderDesignGenerator | None = None,
        planning_generator: BuilderPlanningGenerator | None = None,
        composition_saga_projector: BuilderCompositionSagaChildProjector | None = None,
        agent_catalog_service: AgentCatalogService | None = None,
    ) -> None:
        self._settings = settings
        self._repository_factory = repository_factory
        self._builder_repository_factory = builder_repository_factory
        self._design_system_repository_factory = design_system_repository_factory
        self._component_catalog_resolver = component_catalog_resolver
        self._generator = generator
        self._wireframe_generator = wireframe_generator
        self._design_generator = design_generator
        self._planning_generator = planning_generator
        self._composition_sagas = composition_saga_projector
        self._agents = agent_catalog_service or AgentCatalogService(settings)

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[BuilderGenerationJobTarget, _GenerationJobInput],
    ) -> (
        BuilderGenerationJobResult
        | BuilderPlanningGenerationJobResult
        | BuilderWireframeGenerationJobResult
        | BuilderDesignGenerationJobResult
        | JobHandledFailure
        | None
    ):
        state = await self._state(context)
        status = BuilderGenerationStatus(str(state.record.status))
        if status in {
            BuilderGenerationStatus.SUCCEEDED,
            BuilderGenerationStatus.PARTIAL,
            BuilderGenerationStatus.FAILED,
            BuilderGenerationStatus.CANCELLED,
        }:
            await self._mark_terminal(
                context=context,
                status=status,
                error_code="BUILDER_GENERATION_FAILED" if status is BuilderGenerationStatus.FAILED else None,
            )
        if status in {BuilderGenerationStatus.SUCCEEDED, BuilderGenerationStatus.PARTIAL}:
            return self._result(state)
        if status == BuilderGenerationStatus.FAILED:
            return self._failure(state, "BUILDER_GENERATION_FAILED")
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[BuilderGenerationJobTarget, _GenerationJobInput],
    ) -> (
        BuilderGenerationJobResult
        | BuilderPlanningGenerationJobResult
        | BuilderWireframeGenerationJobResult
        | BuilderDesignGenerationJobResult
        | JobHandledFailure
    ):
        actor_user_id = context.actor_user_id
        if actor_user_id is None:
            raise PermanentJobExecutionError(
                code="BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH",
                safe_message="Builder generation requires its persisted actor",
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
                candidate = await self._generate_candidate(
                    state=state,
                    actor_user_id=actor_user_id,
                    candidate_index=candidate_index,
                )
            except BuilderSitemapGeneratorError as error:
                await self._record_failure(
                    context=context,
                    candidate_index=candidate_index,
                    code=error.code,
                )
                completed += 2
                if not error.continue_candidates:
                    break
                continue
            completed += 1
            await context.report_progress(_progress("previewing", completed, total))
            command_key = context.idempotency_key(step=f"candidate-{candidate_index}-preview")
            builder_repository = self._builder_repository_factory()
            preview = await SiteBuilderChangeSetService(
                repository=builder_repository,
                design_system_repository=self._design_system_repository_factory(),
                component_catalog_resolver=self._component_catalog_resolver,
                content_commands=None,
                settings=self._settings,
            ).preview(
                organization_id=builder_repository.tenant_context.identity.organization_id,
                workspace_id=state.record.workspace_id,
                project_id=state.record.project_id,
                runtime_id=state.record.runtime_id,
                actor_user_id=actor_user_id,
                idempotency_key=command_key,
                payload=self._preview_payload(state=state, operations=candidate.operations),
            )
            await self._record_candidate(
                context=context,
                candidate_index=candidate_index,
                change_set_id=UUID(str(preview.change_set_id)),
                command_key=command_key,
            )
            completed += 1
        await context.report_progress(_progress("finalizing", min(completed, total - 1), total))
        state = await self._state(context)
        if not state.candidates:
            await self._mark_terminal(
                context=context,
                status=BuilderGenerationStatus.FAILED,
            )
            return self._failure(state, "BUILDER_GENERATION_FAILED")
        terminal = (
            BuilderGenerationStatus.PARTIAL
            if state.failures or len(state.candidates) < state.record.candidate_count
            else BuilderGenerationStatus.SUCCEEDED
        )
        await self._mark_terminal(context=context, status=terminal)
        await context.report_progress(_progress("finalizing", total, total))
        return self._result(await self._state(context))

    async def _generate_candidate(
        self,
        *,
        state: _ExecutionState,
        actor_user_id: UUID,
        candidate_index: int,
    ):
        record = state.record
        if record.target_stage == "planning":
            planning_context = state.planning_context
            if planning_context is None or record.agent_version_id is None or self._planning_generator is None:
                _raise_contract_mismatch("Builder planning generation snapshots are unavailable")
            return await self._planning_generator.generate(
                request=BuilderPlanningGenerationRequest(
                    workspace_id=record.workspace_id,
                    project_id=record.project_id,
                    actor_user_id=actor_user_id,
                    agent_run_id=record.agent_run_id,
                    agent_version_id=record.agent_version_id,
                    correlation_id=record.id.hex,
                    candidate_index=candidate_index,
                    objective=record.objective,
                    locale=record.locale,
                    agent_instructions=state.agent_instructions,
                    planning_context=planning_context,
                )
            )
        if record.target_stage == "wireframe":
            composition_context = state.composition_context
            if composition_context is None or record.agent_version_id is None:
                _raise_contract_mismatch("Builder Wireframe generation snapshots are unavailable")
            return await self._wireframe_generator.generate(
                request=BuilderWireframeGenerationRequest(
                    workspace_id=record.workspace_id,
                    project_id=record.project_id,
                    actor_user_id=actor_user_id,
                    agent_run_id=record.agent_run_id,
                    agent_version_id=record.agent_version_id,
                    correlation_id=record.id.hex,
                    candidate_index=candidate_index,
                    objective=record.objective,
                    locale=record.locale,
                    agent_instructions=state.agent_instructions,
                    wireframe_context=composition_context,
                )
            )
        if record.target_stage == "design":
            design_context = state.design_context
            if design_context is None or record.agent_version_id is None or self._design_generator is None:
                _raise_contract_mismatch("Builder Design generation snapshots are unavailable")
            return await self._design_generator.generate(
                request=BuilderDesignGenerationRequest(
                    workspace_id=record.workspace_id,
                    project_id=record.project_id,
                    actor_user_id=actor_user_id,
                    agent_run_id=record.agent_run_id,
                    agent_version_id=record.agent_version_id,
                    correlation_id=record.id.hex,
                    candidate_index=candidate_index,
                    objective=record.objective,
                    locale=record.locale,
                    agent_instructions=state.agent_instructions,
                    design_context=design_context,
                )
            )
        builder_context = state.builder_context
        if record.target_stage != "sitemap" or builder_context is None or record.agent_run_id is None:
            _raise_contract_mismatch("Builder Sitemap generation snapshots are unavailable")
        return await self._generator.generate(
            request=BuilderSitemapGenerationRequest(
                workspace_id=record.workspace_id,
                project_id=record.project_id,
                actor_user_id=actor_user_id,
                agent_run_id=record.agent_run_id,
                correlation_id=record.id.hex,
                candidate_index=candidate_index,
                objective=record.objective,
                locale=record.locale,
                agent_instructions=state.agent_instructions,
                builder_context=builder_context,
            )
        )

    @staticmethod
    def _preview_payload(*, state: _ExecutionState, operations) -> BuilderChangeSetPreviewRequest:
        record = state.record
        if record.target_stage == "planning":
            return BuilderChangeSetPreviewRequest(
                base_revision_id=record.base_site_revision_id,
                base_etag=record.base_etag,
                operations=operations,
                provenance_source="agent",
                agent_run_id=record.agent_run_id,
                agent_id=record.agent_id if record.agent_run_id is None else None,
                tool_name=BUILDER_SITEMAP_APPLY_TOOL,
                expires_in_seconds=86_400,
            )
        if record.target_stage == "wireframe":
            return BuilderChangeSetPreviewRequest(
                base_revision_id=record.base_site_revision_id,
                base_etag=record.base_etag,
                operations=operations,
                provenance_source="agent",
                agent_run_id=record.agent_run_id,
                agent_id=record.agent_id if record.agent_run_id is None else None,
                tool_name=BUILDER_WIREFRAME_APPLY_TOOL,
                expires_in_seconds=86_400,
            )
        if record.target_stage == "design":
            return BuilderChangeSetPreviewRequest(
                base_revision_id=record.base_site_revision_id,
                base_etag=record.base_etag,
                operations=operations,
                provenance_source="agent",
                agent_run_id=record.agent_run_id,
                agent_id=record.agent_id if record.agent_run_id is None else None,
                tool_name=BUILDER_DESIGN_APPLY_TOOL,
                expires_in_seconds=86_400,
            )
        return BuilderChangeSetPreviewRequest(
            base_revision_id=record.base_site_revision_id,
            base_etag=record.base_etag,
            operations=operations,
            provenance_source="agent",
            agent_run_id=record.agent_run_id,
            tool_name=BUILDER_SITEMAP_APPLY_TOOL,
            expires_in_seconds=86_400,
        )

    async def cancel(
        self,
        *,
        context: JobExecutionContext[BuilderGenerationJobTarget, _GenerationJobInput],
    ) -> None:
        await self._mark_terminal(context=context, status=BuilderGenerationStatus.CANCELLED)

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[BuilderGenerationJobTarget, _GenerationJobInput],
        error: PermanentJobExecutionError | TransientJobExecutionError | UnexpectedJobExecutionError,
    ) -> JobHandledFailure | None:
        await self._mark_terminal(
            context=context,
            status=BuilderGenerationStatus.FAILED,
            error_code=error.code,
        )
        state = await self._state(context)
        return self._failure(state, error.code)

    async def _state(
        self,
        context: JobExecutionContext[
            BuilderGenerationJobTarget,
            _GenerationJobInput,
        ],
    ) -> _ExecutionState:
        repository = self._repository_factory()
        builder_repository = self._builder_repository_factory()
        record = await repository.get_generation(
            project_id=context.target.project_id,
            generation_id=context.input_reference.generation_id,
        )
        if (
            record is None
            or record.job_id != context.lease.job_id
            or record.workspace_id != context.target.workspace_id
            or record.project_id != context.target.project_id
            or record.runtime_id != context.target.runtime_id
            or record.environment_id != context.target.environment_id
            or record.base_site_revision_id != context.input_reference.base_site_revision_id
            or record.actor_user_id != context.actor_user_id
            or record.request_fingerprint != context.input_reference.request_hash
            or record.base_manifest_hash != context.source_revision
        ):
            _raise_contract_mismatch("Builder generation record does not match its canonical Job")
        assert record is not None
        if record.target_stage == "planning":
            if (
                not isinstance(context.input_reference, BuilderPlanningGenerationJobInput)
                or record.composition_saga_id != UUID(str(context.input_reference.saga_id))
                or record.agent_version_id != UUID(str(context.input_reference.agent_version_id))
                or record.agent_id is None
                or record.agent_assignment_id is None
                or not isinstance(record.builder_context, dict)
                or not isinstance(record.planning_context, dict)
            ):
                _raise_contract_mismatch("Builder planning generation snapshots are unavailable")
            try:
                builder_context = AgentRunBuilderContextV1.model_validate(record.builder_context)
                planning_context = BuilderPlanningGenerationContextV1.model_validate(record.planning_context)
                targets = tuple(BuilderGenerationTargetV1.model_validate(target) for target in record.targets)
            except ValidationError:
                _raise_contract_mismatch("Builder planning generation snapshots are invalid")
            persisted_targets = tuple((target.kind, UUID(str(target.item_id))) for target in targets)
            context_targets = tuple((target.kind, target.item_id) for target in planning_context.targets)
            if (
                UUID(str(builder_context.site_revision_id)) != record.base_site_revision_id
                or builder_context.manifest_hash != record.base_etag
                or context_targets != persisted_targets
            ):
                _raise_contract_mismatch("Builder planning generation snapshots do not match the request")
            resolved, _ = await self._agents.validate_run_snapshot(
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
            if BUILDER_SITEMAP_GENERATE_TOOL not in resolved.tool_grants:
                _raise_contract_mismatch("Builder planning generation Tool grant is unavailable")
            return _ExecutionState(
                record=record,
                builder_context=builder_context,
                planning_context=planning_context,
                composition_context=None,
                design_context=None,
                agent_instructions=resolved.instructions,
                candidates=tuple(_CandidateReference.model_validate(item) for item in record.candidates),
                failures=tuple(BuilderGenerationFailureOut.model_validate(item) for item in record.failures),
            )
        if record.target_stage == "wireframe":
            if (
                not isinstance(context.input_reference, BuilderWireframeGenerationJobInput)
                or record.agent_version_id != context.input_reference.agent_version_id
                or record.agent_id is None
                or record.agent_assignment_id is None
                or not isinstance(record.builder_context, dict)
                or not isinstance(record.composition_context, dict)
            ):
                _raise_contract_mismatch("Builder Wireframe generation snapshots are unavailable")
            try:
                builder_context = AgentRunBuilderContextV1.model_validate(record.builder_context)
                composition_context = BuilderWireframeGenerationContextV1.model_validate(record.composition_context)
                targets = tuple(BuilderGenerationTargetV1.model_validate(target) for target in record.targets)
            except ValidationError:
                _raise_contract_mismatch("Builder Wireframe generation snapshots are invalid")
            persisted_target_identities = tuple((target.kind, UUID(str(target.item_id))) for target in targets)
            context_target_identities = tuple(
                (target.kind, UUID(str(target.item_id))) for target in composition_context.targets
            )
            if (
                UUID(str(builder_context.site_revision_id)) != record.base_site_revision_id
                or builder_context.manifest_hash != record.base_etag
                or context_target_identities != persisted_target_identities
            ):
                _raise_contract_mismatch("Builder Wireframe generation snapshots do not match the request")
            resolved, _ = await self._agents.validate_run_snapshot(
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
            if BUILDER_WIREFRAME_GENERATE_TOOL not in resolved.tool_grants:
                _raise_contract_mismatch("Builder Wireframe generation Tool grant is unavailable")
            candidates = tuple(_CandidateReference.model_validate(item) for item in record.candidates)
            failures = tuple(BuilderGenerationFailureOut.model_validate(item) for item in record.failures)
            return _ExecutionState(
                record=record,
                builder_context=builder_context,
                planning_context=None,
                composition_context=composition_context,
                design_context=None,
                agent_instructions=resolved.instructions,
                candidates=candidates,
                failures=failures,
            )
        if record.target_stage == "design":
            if (
                not isinstance(context.input_reference, BuilderDesignGenerationJobInput)
                or record.agent_version_id != context.input_reference.agent_version_id
                or record.agent_id is None
                or record.agent_assignment_id is None
                or not isinstance(record.builder_context, dict)
                or not isinstance(record.design_context, dict)
            ):
                _raise_contract_mismatch("Builder Design generation snapshots are unavailable")
            try:
                builder_context = AgentRunBuilderContextV1.model_validate(record.builder_context)
                design_context = BuilderDesignGenerationContextV1.model_validate(record.design_context)
                targets = tuple(BuilderGenerationTargetV1.model_validate(target) for target in record.targets)
            except ValidationError:
                _raise_contract_mismatch("Builder Design generation snapshots are invalid")
            persisted_target_identities = tuple((target.kind, UUID(str(target.item_id))) for target in targets)
            context_target_identities = tuple(
                (target.kind, UUID(str(target.item_id))) for target in design_context.targets
            )
            if (
                UUID(str(builder_context.site_revision_id)) != record.base_site_revision_id
                or builder_context.manifest_hash != record.base_etag
                or context_target_identities != persisted_target_identities
            ):
                _raise_contract_mismatch("Builder Design generation snapshots do not match the request")
            resolved, _ = await self._agents.validate_run_snapshot(
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
            if BUILDER_DESIGN_GENERATE_TOOL not in resolved.tool_grants:
                _raise_contract_mismatch("Builder Design generation Tool grant is unavailable")
            return _ExecutionState(
                record=record,
                builder_context=builder_context,
                planning_context=None,
                composition_context=None,
                design_context=design_context,
                agent_instructions=resolved.instructions,
                candidates=tuple(_CandidateReference.model_validate(item) for item in record.candidates),
                failures=tuple(BuilderGenerationFailureOut.model_validate(item) for item in record.failures),
            )
        if (
            record.target_stage != "sitemap"
            or not isinstance(context.input_reference, BuilderGenerationJobInput)
            or record.agent_run_id != context.input_reference.agent_run_id
        ):
            _raise_contract_mismatch("Builder Sitemap generation record does not match its canonical Job")
        assert record.agent_run_id is not None
        snapshot = await repository.get_agent_builder_snapshot(run_id=record.agent_run_id, conn=None)
        run = await builder_repository.get_agent_run_for_builder(
            run_id=record.agent_run_id,
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            actor_user_id=record.actor_user_id,
            conn=None,
        )
        if snapshot is None or run is None or run.lead_agent_version_id is None:
            _raise_contract_mismatch("Builder generation Agent snapshot is unavailable")
        version = await builder_repository.get_agent_version_for_builder(
            version_id=run.lead_agent_version_id,
            conn=None,
        )
        if version is None or not version.instructions.strip():
            _raise_contract_mismatch("Builder generation Agent version is unavailable")
        builder_context = AgentRunBuilderContextV1.model_validate(snapshot.context_snapshot)
        candidates = tuple(_CandidateReference.model_validate(item) for item in record.candidates)
        failures = tuple(BuilderGenerationFailureOut.model_validate(item) for item in record.failures)
        return _ExecutionState(
            record=record,
            builder_context=builder_context,
            planning_context=None,
            composition_context=None,
            design_context=None,
            agent_instructions=version.instructions.strip(),
            candidates=candidates,
            failures=failures,
        )

    async def _mark_running(self, *, context) -> None:
        async def commit() -> None:
            record = await self._locked(context)
            if BuilderGenerationStatus(str(record.status)) == BuilderGenerationStatus.QUEUED:
                record = await self._repository_factory().update_generation(
                    record=record,
                    values={"status": BuilderGenerationStatus.RUNNING, "started_at": datetime.now(UTC)},
                    conn=None,
                )
            if BuilderGenerationStatus(str(record.status)) == BuilderGenerationStatus.RUNNING:
                await self._project_parent_running(record)

        await context.run_fenced_domain_commit(commit)

    async def _record_candidate(self, *, context, candidate_index: int, change_set_id: UUID, command_key: str) -> None:
        async def commit() -> None:
            record = await self._locked(context)
            current = list(record.candidates)
            if any(item.get("candidateIndex") == candidate_index for item in current if isinstance(item, dict)):
                return
            current.append({
                "candidateIndex": candidate_index,
                "changeSetId": str(change_set_id),
                "commandKey": command_key,
            })
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
                BuilderGenerationFailureOut(
                    candidate_index=candidate_index,
                    code=code,
                    message_key=code,
                ).model_dump(mode="json", by_alias=True)
            )
            await self._repository_factory().update_generation(
                record=record,
                values={"failures": current},
                conn=None,
            )

        await context.run_fenced_domain_commit(commit)

    async def _mark_terminal(
        self,
        *,
        context,
        status: BuilderGenerationStatus,
        error_code: str | None = None,
    ) -> None:
        async def commit() -> None:
            record = await self._locked(context)
            current = BuilderGenerationStatus(str(record.status))
            if current not in {
                BuilderGenerationStatus.SUCCEEDED,
                BuilderGenerationStatus.PARTIAL,
                BuilderGenerationStatus.FAILED,
                BuilderGenerationStatus.CANCELLED,
            }:
                record = await self._repository_factory().update_generation(
                    record=record,
                    values={"status": status, "terminal_at": datetime.now(UTC)},
                    conn=None,
                )
            await self._project_parent_terminal(record, error_code=error_code)

        await context.run_fenced_domain_commit(commit)

    async def _project_parent_running(self, record: BuilderGenerationRecord) -> None:
        if record.composition_saga_id is None:
            return
        if self._composition_sagas is None:
            _raise_contract_mismatch("Builder Composition Saga projector is unavailable")
        await self._composition_sagas.mark_running(generation=record)

    async def _project_parent_terminal(
        self,
        record: BuilderGenerationRecord,
        *,
        error_code: str | None,
    ) -> None:
        if record.composition_saga_id is None:
            return
        if self._composition_sagas is None:
            _raise_contract_mismatch("Builder Composition Saga projector is unavailable")
        await self._composition_sagas.mark_terminal(
            generation=record,
            error_code=error_code,
        )

    async def _locked(self, context) -> BuilderGenerationRecord:
        record = await self._repository_factory().get_generation(
            project_id=context.target.project_id,
            generation_id=context.input_reference.generation_id,
            conn=None,
            for_update=True,
        )
        if record is None or record.job_id != context.lease.job_id:
            raise PermanentJobExecutionError(
                code="BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH",
                safe_message="Builder generation record is unavailable under its execution fence",
            )
        return record

    @staticmethod
    def _result(
        state: _ExecutionState,
    ) -> (
        BuilderGenerationJobResult
        | BuilderPlanningGenerationJobResult
        | BuilderWireframeGenerationJobResult
        | BuilderDesignGenerationJobResult
    ):
        status = BuilderGenerationStatus(str(state.record.status))
        values = {
            "generation_id": state.record.id,
            "base_site_revision_id": state.record.base_site_revision_id,
            "status": "partial" if status == BuilderGenerationStatus.PARTIAL else "succeeded",
            "candidate_change_set_ids": tuple(item.change_set_id for item in state.candidates),
            "failed_candidate_count": len(state.failures),
        }
        if state.record.target_stage == "planning":
            if state.record.composition_saga_id is None:
                _raise_contract_mismatch("Builder planning generation parent is unavailable")
            return BuilderPlanningGenerationJobResult(
                saga_id=state.record.composition_saga_id,
                **values,
            )
        if state.record.target_stage == "wireframe":
            return BuilderWireframeGenerationJobResult(**values)
        if state.record.target_stage == "design":
            return BuilderDesignGenerationJobResult(**values)
        return BuilderGenerationJobResult(
            **values,
        )

    @staticmethod
    def _failure(state: _ExecutionState, public_error_code: str) -> JobHandledFailure:
        metadata = BuilderGenerationFailureMetadata(
            public_error_code=public_error_code,
            failed_candidate_count=max(len(state.failures), 1),
        )
        return JobHandledFailure(
            code=BUILDER_GENERATION_FAILED_CODE,
            safe_message="Builder generation did not produce a valid candidate",
            metadata=cast(JsonObject, metadata.model_dump(mode="json", by_alias=True)),
        )


def _progress(phase: str, completed: int, total: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"BUILDER_GENERATION_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=total,
    )


def _raise_contract_mismatch(message: str) -> NoReturn:
    raise PermanentJobExecutionError(
        code="BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH",
        safe_message=message,
    )
