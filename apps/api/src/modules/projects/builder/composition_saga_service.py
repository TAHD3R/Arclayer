from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import Literal, NoReturn, Protocol, cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.events import events
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.builder._enums import BuilderChangeSetStatus, BuilderCompositionSagaStatus, BuilderGenerationStatus
from src.models.builder.composition_saga import BuilderCompositionSagaRecord
from src.models.builder.generation import BuilderGenerationRecord
from src.models.builder.site_revision import SiteRevisionManifestRecord
from src.models.jobs.background_job import JobAuthorityMode
from src.modules.ai.agent_tool_grants import (
    BUILDER_SITEMAP_APPLY_TOOL,
    BUILDER_SITEMAP_GENERATE_TOOL,
    BUILDER_WIREFRAME_APPLY_TOOL,
    BUILDER_WIREFRAME_GENERATE_TOOL,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.projects.builder.authority import require_builder_authority
from src.modules.projects.builder.command import builder_request_fingerprint, require_builder_idempotency_key
from src.modules.projects.builder.composition_saga_job_contract import (
    BUILDER_PLANNING_GENERATION_JOB_TYPE,
    BUILDER_PLANNING_GENERATION_JOB_TYPE_VERSION,
    BuilderPlanningGenerationJobInput,
)
from src.modules.projects.builder.composition_saga_provider import (
    BuilderPlanningGenerationContextV1,
    BuilderPlanningGenerationTargetContextV1,
)
from src.modules.projects.builder.composition_saga_repository import BuilderCompositionSagaRepository
from src.modules.projects.builder.composition_saga_schema import (
    BuilderCompositionSagaCancelRequest,
    BuilderCompositionSagaCreateRequest,
    BuilderCompositionSagaFailureOut,
    BuilderCompositionSagaOut,
    BuilderCompositionSagaPhaseTransitionRequest,
    BuilderCompositionSagaRecoveryOut,
)
from src.modules.projects.builder.generation_authority import (
    BuilderGenerationAuthorityResolver,
    ResolvedBuilderGenerationAuthority,
)
from src.modules.projects.builder.generation_context import partition_generation_targets_by_planning
from src.modules.projects.builder.generation_job_contract import (
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
    BuilderGenerationJobTarget,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1
from src.modules.projects.builder.generation_service import BuilderGenerationService
from src.modules.projects.builder.manifest import parse_site_revision_manifest
from src.modules.projects.builder.repository import SiteBuilderRepository

_REQUIRED_SAGA_TOOL_GRANTS = (
    BUILDER_SITEMAP_GENERATE_TOOL,
    BUILDER_SITEMAP_APPLY_TOOL,
    BUILDER_WIREFRAME_GENERATE_TOOL,
    BUILDER_WIREFRAME_APPLY_TOOL,
)


class BuilderCompositionChildCreation(Protocol):
    generation: BuilderGenerationRecord
    job_result: BackgroundJobCreateResult


class BuilderCompositionChildCreator(Protocol):
    async def create_in_transaction(
        self,
        *,
        organization_id: UUID,
        saga: BuilderCompositionSagaRecord,
        revision: SiteRevisionManifestRecord,
        authority: ResolvedBuilderGenerationAuthority,
        conn: BaseDBAsyncClient,
    ) -> BuilderCompositionChildCreation: ...


class BuilderCompositionSagaService(BaseService):
    def __init__(
        self,
        *,
        repository: BuilderCompositionSagaRepository,
        generation_repository: BuilderGenerationRepository,
        builder_repository: SiteBuilderRepository,
        authority_resolver: BuilderGenerationAuthorityResolver,
        composition_child_creator: BuilderCompositionChildCreator | None = None,
        generation_service: BuilderGenerationService | None = None,
        settings: Settings | None = None,
        job_service: BackgroundJobService | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=events, default_event_source="builder_composition_saga")
        self._repository = repository
        self._generations = generation_repository
        self._builder_repository = builder_repository
        self._authority = authority_resolver
        self._composition_child_creator = composition_child_creator
        self._generation_service = generation_service
        self._jobs = job_service or BackgroundJobService(self.settings)

    async def create(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: BuilderCompositionSagaCreateRequest,
    ) -> BuilderCompositionSagaOut:
        key = require_builder_idempotency_key(idempotency_key)
        if runtime_id is None:
            _raise_conflict("PROJECT_RUNTIME_IDENTITY_REQUIRED")
        saga_id = _saga_identity(workspace_id=workspace_id, project_id=project_id, idempotency_key=key)
        fingerprint = _request_fingerprint(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            actor_user_id=actor_user_id,
            payload=payload,
        )
        job_result: BackgroundJobCreateResult | None = None
        async with self.tx() as conn:
            existing = await self._lock_scope_and_replay(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                saga_id=saga_id,
                fingerprint=fingerprint,
                conn=conn,
            )
            if existing is not None:
                return await self._project(record=existing, actor_user_id=actor_user_id)
            revision, site_id, environment_id, manifest_hash = await self._resolve_base(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                payload=payload,
                conn=conn,
            )
            authority = await self._authority.resolve(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                base_revision_id=revision.id,
                base_etag=manifest_hash,
                agent_run_id=UUID(str(payload.agent_run_id)) if payload.agent_run_id else None,
                agent_id=UUID(str(payload.agent_id)) if payload.agent_id else None,
                required_tool_grants=_REQUIRED_SAGA_TOOL_GRANTS,
                conn=conn,
            )
            partition = partition_generation_targets_by_planning(
                builder_context=authority.builder_context,
                targets=payload.targets,
            )
            if not partition.unplanned:
                _raise_conflict("BUILDER_COMPOSITION_SAGA_PLANNING_REQUIRED")
            generation_id = _planning_generation_identity(saga_id)
            planning_context = _planning_context(partition=partition)
            job_result = await self._jobs.create_job_in_transaction(
                command=self._planning_job_command(
                    saga_id=saga_id,
                    generation_id=generation_id,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    runtime_id=runtime_id,
                    environment_id=environment_id,
                    actor_user_id=actor_user_id,
                    agent_version_id=authority.agent_version_id,
                    base_revision_id=revision.id,
                    request_fingerprint=fingerprint,
                    source_revision=manifest_hash,
                ),
                conn=conn,
            )
            generation = await self._create_planning_generation(
                saga_id=saga_id,
                generation_id=generation_id,
                job_id=job_result.job.id,
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                actor_user_id=actor_user_id,
                revision=revision,
                manifest_hash=manifest_hash,
                fingerprint=fingerprint,
                payload=payload,
                authority=authority,
                planning_targets=partition.unplanned,
                planning_context=planning_context,
                conn=conn,
            )
            record = await self._create_parent(
                saga_id=saga_id,
                generation_id=generation.id,
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                actor_user_id=actor_user_id,
                revision=revision,
                manifest_hash=manifest_hash,
                fingerprint=fingerprint,
                payload=payload,
                authority=authority,
                planning_targets=partition.unplanned,
                conn=conn,
            )
            await _write_created_activity(
                settings=self.settings,
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                record=record,
                job_id=job_result.job.id,
                conn=conn,
            )
        await self._jobs.publish_created_after_commit(job_result)
        return await self._project(record=record, actor_user_id=actor_user_id)

    async def get(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        saga_id: UUID,
    ) -> BuilderCompositionSagaOut:
        async with self.tx() as conn:
            record = await self._require_owned(
                project_id=project_id,
                actor_user_id=actor_user_id,
                saga_id=saga_id,
                conn=conn,
            )
        return await self._project(record=record, actor_user_id=actor_user_id)

    async def recover(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        targets: tuple[BuilderGenerationTargetV1, ...],
    ) -> BuilderCompositionSagaRecoveryOut:
        persisted_targets = [target.model_dump(mode="json", by_alias=True) for target in targets]
        active_record = await self._repository.get_latest_recovery_saga(
            project_id=project_id,
            actor_user_id=actor_user_id,
            targets=persisted_targets,
            statuses=(
                BuilderCompositionSagaStatus.PLANNING_QUEUED,
                BuilderCompositionSagaStatus.PLANNING_RUNNING,
                BuilderCompositionSagaStatus.PLANNING_REVIEW_PENDING,
                BuilderCompositionSagaStatus.COMPOSITION_QUEUED,
                BuilderCompositionSagaStatus.COMPOSITION_RUNNING,
                BuilderCompositionSagaStatus.COMPOSITION_REVIEW_PENDING,
            ),
        )
        terminal_record = await self._repository.get_latest_recovery_saga(
            project_id=project_id,
            actor_user_id=actor_user_id,
            targets=persisted_targets,
            statuses=(
                BuilderCompositionSagaStatus.COMPLETED,
                BuilderCompositionSagaStatus.FAILED,
                BuilderCompositionSagaStatus.CANCELLED,
            ),
        )
        active = (
            await self._project(record=active_record, actor_user_id=actor_user_id)
            if active_record is not None
            else None
        )
        latest_terminal = (
            await self._project(record=terminal_record, actor_user_id=actor_user_id)
            if terminal_record is not None
            else None
        )
        return BuilderCompositionSagaRecoveryOut(active=active, latest_terminal=latest_terminal)

    async def cancel(
        self,
        *,
        organization_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        saga_id: UUID,
        payload: BuilderCompositionSagaCancelRequest,
    ) -> BuilderCompositionSagaOut:
        now = datetime.now(UTC)
        reason = payload.reason.strip() if payload.reason and payload.reason.strip() else None
        cancellation_job = None
        cancellation_requested = False
        async with self.tx() as conn:
            parent = await self._require_owned(
                project_id=project_id,
                actor_user_id=actor_user_id,
                saga_id=saga_id,
                conn=conn,
                for_update=True,
            )
            status = BuilderCompositionSagaStatus(str(parent.status))
            if status in {
                BuilderCompositionSagaStatus.COMPLETED,
                BuilderCompositionSagaStatus.FAILED,
                BuilderCompositionSagaStatus.CANCELLED,
            }:
                record = parent
            elif status in {
                BuilderCompositionSagaStatus.PLANNING_REVIEW_PENDING,
                BuilderCompositionSagaStatus.COMPOSITION_REVIEW_PENDING,
            }:
                record = await self._repository.update_saga(
                    record=parent,
                    values={
                        "status": BuilderCompositionSagaStatus.CANCELLED,
                        "waiting_reason": None,
                        "cancel_requested_at": now,
                        "cancel_requested_by_user_id": actor_user_id,
                        "cancel_reason": reason,
                        "terminal_at": now,
                    },
                    conn=conn,
                )
                await _write_cancelled_activity(
                    settings=self.settings,
                    organization_id=organization_id,
                    record=record,
                    phase=_current_phase(status),
                    conn=conn,
                )
            else:
                record, cancellation_job, cancellation_requested = await self._request_active_child_cancellation(
                    organization_id=organization_id,
                    parent=parent,
                    status=status,
                    actor_user_id=actor_user_id,
                    reason=reason,
                    requested_at=now,
                    conn=conn,
                )
        if cancellation_job is not None:
            await self._jobs.publish_cancellation_requested_after_commit(
                job=cancellation_job,
                requested=cancellation_requested,
            )
        return await self._project(record=record, actor_user_id=actor_user_id)

    async def _request_active_child_cancellation(
        self,
        *,
        organization_id: UUID,
        parent: BuilderCompositionSagaRecord,
        status: BuilderCompositionSagaStatus,
        actor_user_id: UUID,
        reason: str | None,
        requested_at: datetime,
        conn: BaseDBAsyncClient,
    ):
        phase, generation_id, job_type = _active_child_identity(parent=parent, status=status)
        generation = await self._generations.get_generation(
            project_id=parent.project_id,
            generation_id=generation_id,
            conn=conn,
            for_update=True,
        )
        if not _is_exact_active_child(
            parent=parent,
            generation=generation,
            generation_id=generation_id,
            phase=phase,
        ):
            _raise_conflict("BUILDER_COMPOSITION_SAGA_CHILD_INVALID")
        assert generation is not None
        job = await self._generations.get_job(job_id=generation.job_id, conn=conn, for_update=True)
        if job is None or job.job_type != job_type:
            _raise_conflict("BUILDER_COMPOSITION_SAGA_CHILD_INVALID")
        job, requested = await self._jobs.request_cancellation_in_transaction(
            job_id=job.id,
            requested_by_user_id=actor_user_id,
            reason=reason,
            requested_at=requested_at,
            conn=conn,
        )
        record = await self._repository.update_saga(
            record=parent,
            values={
                "cancel_requested_at": requested_at,
                "cancel_requested_by_user_id": actor_user_id,
                "cancel_reason": reason,
            },
            conn=conn,
        )
        if requested:
            await _write_cancellation_requested_activity(
                settings=self.settings,
                organization_id=organization_id,
                record=record,
                phase=phase,
                generation_id=generation_id,
                job_id=job.id,
                conn=conn,
            )
        return record, job, requested

    async def transition_phase(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
        actor_user_id: UUID,
        saga_id: UUID,
        payload: BuilderCompositionSagaPhaseTransitionRequest,
    ) -> BuilderCompositionSagaOut:
        if runtime_id is None:
            _raise_conflict("PROJECT_RUNTIME_IDENTITY_REQUIRED")
        job_result: BackgroundJobCreateResult | None = None
        async with self.tx() as conn:
            parent = await self._lock_transition_parent(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                actor_user_id=actor_user_id,
                saga_id=saga_id,
                conn=conn,
            )
            if payload.expected_phase == "planning":
                record, job_result = await self._transition_from_planning(
                    organization_id=organization_id,
                    parent=parent,
                    payload=payload,
                    conn=conn,
                )
            else:
                record = await self._transition_from_composition(
                    organization_id=organization_id,
                    parent=parent,
                    payload=payload,
                    conn=conn,
                )
        if job_result is not None:
            await self._jobs.publish_created_after_commit(job_result)
        return await self._project(record=record, actor_user_id=actor_user_id)

    async def _transition_from_planning(
        self,
        *,
        organization_id: UUID,
        parent: BuilderCompositionSagaRecord,
        payload: BuilderCompositionSagaPhaseTransitionRequest,
        conn: BaseDBAsyncClient,
    ) -> tuple[BuilderCompositionSagaRecord, BackgroundJobCreateResult | None]:
        if _is_planning_transition_replay(parent=parent, payload=payload):
            return parent, None
        revision = await self._prove_planning_apply_evidence(parent=parent, payload=payload, conn=conn)
        authority = await self._resolve_transition_authority(parent=parent, revision=revision, conn=conn)
        creator = self._composition_child_creator
        if creator is None:
            raise RuntimeError("Builder Composition Saga transition requires its child creator")
        creation = await creator.create_in_transaction(
            organization_id=organization_id,
            saga=parent,
            revision=revision,
            authority=authority,
            conn=conn,
        )
        record = await self._repository.update_saga(
            record=parent,
            values={
                "status": BuilderCompositionSagaStatus.COMPOSITION_QUEUED,
                "waiting_reason": None,
                "planning_change_set_id": UUID(str(payload.applied_change_set_id)),
                "planning_result_revision_id": UUID(str(payload.applied_site_revision_id)),
                "composition_generation_id": creation.generation.id,
            },
            conn=conn,
        )
        return record, creation.job_result

    async def _transition_from_composition(
        self,
        *,
        organization_id: UUID,
        parent: BuilderCompositionSagaRecord,
        payload: BuilderCompositionSagaPhaseTransitionRequest,
        conn: BaseDBAsyncClient,
    ) -> BuilderCompositionSagaRecord:
        if _is_composition_transition_replay(parent=parent, payload=payload):
            return parent
        await self._prove_composition_apply_evidence(parent=parent, payload=payload, conn=conn)
        record = await self._repository.update_saga(
            record=parent,
            values={
                "status": BuilderCompositionSagaStatus.COMPLETED,
                "waiting_reason": None,
                "composition_change_set_id": UUID(str(payload.applied_change_set_id)),
                "composition_result_revision_id": UUID(str(payload.applied_site_revision_id)),
                "terminal_at": datetime.now(UTC),
            },
            conn=conn,
        )
        await _write_completed_activity(
            settings=self.settings,
            organization_id=organization_id,
            record=record,
            conn=conn,
        )
        return record

    async def _lock_transition_parent(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        actor_user_id: UUID,
        saga_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> BuilderCompositionSagaRecord:
        project = await self._builder_repository.lock_project(
            project_id=project_id,
            workspace_id=workspace_id,
            conn=conn,
        )
        if project is None:
            _raise_not_found("PROJECT_NOT_FOUND")
        require_builder_authority(project)
        parent = await self._repository.get_saga(
            project_id=project_id,
            saga_id=saga_id,
            conn=conn,
            for_update=True,
        )
        if (
            parent is None
            or parent.workspace_id != workspace_id
            or parent.runtime_id != runtime_id
            or parent.actor_user_id != actor_user_id
        ):
            _raise_not_found("BUILDER_COMPOSITION_SAGA_NOT_FOUND")
        return parent

    async def _prove_planning_apply_evidence(
        self,
        *,
        parent: BuilderCompositionSagaRecord,
        payload: BuilderCompositionSagaPhaseTransitionRequest,
        conn: BaseDBAsyncClient,
    ) -> SiteRevisionManifestRecord:
        if BuilderCompositionSagaStatus(str(parent.status)) is not BuilderCompositionSagaStatus.PLANNING_REVIEW_PENDING:
            _raise_conflict("BUILDER_COMPOSITION_SAGA_PHASE_CONFLICT")
        return await self._prove_child_apply_evidence(
            parent=parent,
            payload=payload,
            phase="planning",
            generation_id=parent.planning_generation_id,
            base_revision_id=parent.initial_site_revision_id,
            conn=conn,
        )

    async def _prove_composition_apply_evidence(
        self,
        *,
        parent: BuilderCompositionSagaRecord,
        payload: BuilderCompositionSagaPhaseTransitionRequest,
        conn: BaseDBAsyncClient,
    ) -> SiteRevisionManifestRecord:
        if (
            BuilderCompositionSagaStatus(str(parent.status))
            is not BuilderCompositionSagaStatus.COMPOSITION_REVIEW_PENDING
        ):
            _raise_conflict("BUILDER_COMPOSITION_SAGA_PHASE_CONFLICT")
        if parent.composition_generation_id is None or parent.planning_result_revision_id is None:
            _raise_conflict("BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")
        return await self._prove_child_apply_evidence(
            parent=parent,
            payload=payload,
            phase="composition",
            generation_id=parent.composition_generation_id,
            base_revision_id=parent.planning_result_revision_id,
            conn=conn,
        )

    async def _prove_child_apply_evidence(
        self,
        *,
        parent: BuilderCompositionSagaRecord,
        payload: BuilderCompositionSagaPhaseTransitionRequest,
        phase: Literal["planning", "composition"],
        generation_id: UUID,
        base_revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SiteRevisionManifestRecord:
        generation = await self._generations.get_generation(
            project_id=parent.project_id,
            generation_id=generation_id,
            conn=conn,
            for_update=True,
        )
        change_set_id = UUID(str(payload.applied_change_set_id))
        if not _is_exact_child_candidate(
            parent=parent,
            generation=generation,
            generation_id=generation_id,
            phase=phase,
            change_set_id=change_set_id,
        ):
            _raise_conflict("BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")
        change_set = await self._builder_repository.get_change_set(
            project_id=parent.project_id,
            change_set_id=change_set_id,
            conn=conn,
            for_update=True,
        )
        revision_id = UUID(str(payload.applied_site_revision_id))
        if not _is_exact_applied_change_set(
            parent=parent,
            change_set=change_set,
            base_revision_id=base_revision_id,
            revision_id=revision_id,
        ):
            _raise_conflict("BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")
        revision = await self._builder_repository.get_site_revision(
            project_id=parent.project_id,
            revision_id=revision_id,
            conn=conn,
            for_update=True,
        )
        latest = await self._builder_repository.get_latest_site_revision(
            project_id=parent.project_id,
            site_id=parent.site_id,
            environment_id=parent.environment_id,
            conn=conn,
            for_update=True,
        )
        if revision is None:
            _raise_conflict("BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")
        if not _is_exact_result_revision(
            parent=parent,
            revision=revision,
            latest=latest,
            base_revision_id=base_revision_id,
        ):
            _raise_conflict("BUILDER_COMPOSITION_SAGA_APPLY_EVIDENCE_INVALID")
        return revision

    async def _resolve_transition_authority(
        self,
        *,
        parent: BuilderCompositionSagaRecord,
        revision: SiteRevisionManifestRecord,
        conn: BaseDBAsyncClient,
    ) -> ResolvedBuilderGenerationAuthority:
        authority = await self._authority.resolve(
            workspace_id=parent.workspace_id,
            project_id=parent.project_id,
            actor_user_id=parent.actor_user_id,
            base_revision_id=revision.id,
            base_etag=revision.manifest_hash,
            agent_run_id=parent.agent_run_id,
            agent_id=None if parent.agent_run_id is not None else parent.agent_id,
            required_tool_grants=_REQUIRED_SAGA_TOOL_GRANTS,
            conn=conn,
        )
        if (
            authority.agent_run_id != parent.agent_run_id
            or authority.agent_id != parent.agent_id
            or authority.agent_version_id != parent.agent_version_id
            or authority.agent_assignment_id != parent.agent_assignment_id
        ):
            _raise_conflict("BUILDER_COMPOSITION_SAGA_AUTHORITY_DRIFT")
        targets = tuple(BuilderGenerationTargetV1.model_validate(target) for target in parent.targets)
        if partition_generation_targets_by_planning(
            builder_context=authority.builder_context,
            targets=targets,
        ).unplanned:
            _raise_conflict("BUILDER_WIREFRAME_PLAN_REQUIRED")
        return authority

    async def _require_owned(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        saga_id: UUID,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> BuilderCompositionSagaRecord:
        record = await self._repository.get_saga(
            project_id=project_id,
            saga_id=saga_id,
            conn=conn,
            for_update=for_update,
        )
        if record is None or record.actor_user_id != actor_user_id:
            _raise_not_found("BUILDER_COMPOSITION_SAGA_NOT_FOUND")
        return record

    async def _lock_scope_and_replay(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        saga_id: UUID,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> BuilderCompositionSagaRecord | None:
        project = await self._builder_repository.lock_project(
            project_id=project_id,
            workspace_id=workspace_id,
            conn=conn,
        )
        if project is None:
            _raise_not_found("PROJECT_NOT_FOUND")
        require_builder_authority(project)
        existing = await self._repository.get_saga(
            project_id=project_id,
            saga_id=saga_id,
            conn=conn,
            for_update=True,
        )
        if existing is not None and (
            existing.request_fingerprint != fingerprint or existing.actor_user_id != actor_user_id
        ):
            _raise_conflict("BUILDER_COMPOSITION_SAGA_IDEMPOTENCY_CONFLICT")
        return existing

    async def _resolve_base(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        payload: BuilderCompositionSagaCreateRequest,
        conn: BaseDBAsyncClient,
    ) -> tuple[SiteRevisionManifestRecord, UUID, UUID, str]:
        revision = await self._builder_repository.get_site_revision(
            project_id=project_id,
            revision_id=UUID(str(payload.base_revision_id)),
            conn=conn,
            for_update=True,
        )
        if revision is None or revision.workspace_id != workspace_id:
            _raise_not_found("SITE_REVISION_NOT_FOUND")
        site = await self._builder_repository.get_site(
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=revision.site_id,
            conn=conn,
        )
        environment = await self._builder_repository.get_environment(
            project_id=project_id,
            environment_id=revision.environment_id,
            conn=conn,
        )
        latest = await self._builder_repository.get_latest_site_revision(
            project_id=project_id,
            site_id=revision.site_id,
            environment_id=revision.environment_id,
            conn=conn,
            for_update=True,
        )
        manifest = parse_site_revision_manifest(revision)
        if site is None or environment is None or latest is None or latest.id != revision.id:
            _raise_conflict("SITE_REVISION_STALE")
        if payload.base_etag != manifest.manifest_hash:
            _raise_conflict("SITE_REVISION_STALE")
        return revision, revision.site_id, revision.environment_id, manifest.manifest_hash

    async def _create_planning_generation(self, **kwargs):
        values = _planning_generation_values(**kwargs)
        return await self._generations.create_generation(values=values, conn=kwargs["conn"])

    async def _create_parent(self, **kwargs):
        values = _parent_values(**kwargs)
        return await self._repository.create_saga(values=values, conn=kwargs["conn"])

    def _planning_job_command(self, **kwargs) -> BackgroundJobCreate:
        definition = self._jobs.registry.require(
            job_type=BUILDER_PLANNING_GENERATION_JOB_TYPE,
            job_type_version=BUILDER_PLANNING_GENERATION_JOB_TYPE_VERSION,
        )
        target = BuilderGenerationJobTarget(
            workspace_id=kwargs["workspace_id"],
            project_id=kwargs["project_id"],
            runtime_id=kwargs["runtime_id"],
            environment_id=kwargs["environment_id"],
        )
        input_reference = BuilderPlanningGenerationJobInput(
            saga_id=kwargs["saga_id"],
            generation_id=kwargs["generation_id"],
            base_site_revision_id=kwargs["base_revision_id"],
            agent_version_id=kwargs["agent_version_id"],
            request_hash=kwargs["request_fingerprint"],
        )
        return BackgroundJobCreate(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
            workspace_id=kwargs["workspace_id"],
            project_id=kwargs["project_id"],
            actor_user_id=kwargs["actor_user_id"],
            target_descriptor=_dump(target),
            input_reference=_dump(input_reference),
            idempotency_key=f"builder-planning-generation:{kwargs['project_id']}:{kwargs['generation_id']}",
            source_revision=kwargs["source_revision"],
            correlation_id=correlation_id.get(None) or kwargs["saga_id"].hex,
            trace_id=correlation_id.get(None),
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            status_key=definition.initial_status_key,
        )

    async def _project(self, *, record: BuilderCompositionSagaRecord, actor_user_id: UUID) -> BuilderCompositionSagaOut:
        if self._generation_service is None:
            raise RuntimeError("Builder Composition Saga projection requires the Generation service")
        planning = await self._generation_service.get(
            project_id=record.project_id,
            actor_user_id=actor_user_id,
            generation_id=record.planning_generation_id,
        )
        composition = (
            await self._generation_service.get(
                project_id=record.project_id,
                actor_user_id=actor_user_id,
                generation_id=record.composition_generation_id,
            )
            if record.composition_generation_id is not None
            else None
        )
        return BuilderCompositionSagaOut(
            saga_id=record.id,
            status=BuilderCompositionSagaStatus(str(record.status)),
            current_phase=_current_phase(BuilderCompositionSagaStatus(str(record.status))),
            initial_base_revision_id=record.initial_site_revision_id,
            initial_base_etag=record.initial_etag,
            targets=tuple(record.targets),
            planning_targets=tuple(record.planning_targets),
            agent_run_id=record.agent_run_id,
            agent_id=record.agent_id,
            agent_version_id=record.agent_version_id,
            agent_assignment_id=record.agent_assignment_id,
            waiting_reason=record.waiting_reason,
            planning_generation=planning,
            planning_change_set_id=record.planning_change_set_id,
            planning_result_revision_id=record.planning_result_revision_id,
            composition_generation=composition,
            composition_change_set_id=record.composition_change_set_id,
            composition_result_revision_id=record.composition_result_revision_id,
            failure=(
                BuilderCompositionSagaFailureOut.model_validate(record.terminal_error)
                if record.terminal_error
                else None
            ),
            cancel_requested_at=record.cancel_requested_at,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )


def _planning_context(*, partition) -> BuilderPlanningGenerationContextV1:
    versions = dict(partition.expected_draft_versions)
    return BuilderPlanningGenerationContextV1(
        targets=tuple(
            BuilderPlanningGenerationTargetContextV1(
                kind=target.kind,
                item_id=UUID(str(target.item_id)),
                expected_draft_version=versions[UUID(str(target.item_id))],
            )
            for target in partition.unplanned
        )
    )


def _planning_generation_values(**kwargs) -> dict[str, object]:
    authority = kwargs["authority"]
    payload = kwargs["payload"]
    return {
        "id": kwargs["generation_id"],
        "workspace_id": kwargs["workspace_id"],
        "project_id": kwargs["project_id"],
        "runtime_id": kwargs["runtime_id"],
        "site_id": kwargs["site_id"],
        "environment_id": kwargs["environment_id"],
        "base_site_revision_id": kwargs["revision"].id,
        "base_manifest_hash": kwargs["manifest_hash"],
        "base_etag": kwargs["manifest_hash"],
        "job_id": kwargs["job_id"],
        "actor_user_id": kwargs["actor_user_id"],
        "agent_run_id": authority.agent_run_id,
        "agent_id": authority.agent_id,
        "agent_version_id": authority.agent_version_id,
        "agent_assignment_id": authority.agent_assignment_id,
        "tool_name": BUILDER_SITEMAP_GENERATE_TOOL,
        "target_stage": "planning",
        "objective": payload.objective.strip(),
        "locale": payload.locale,
        "candidate_count": payload.candidate_count,
        "targets": [target.model_dump(mode="json", by_alias=True) for target in kwargs["planning_targets"]],
        "knowledge_reference_ids": [str(value) for value in payload.knowledge_reference_ids],
        "builder_context": authority.builder_context.model_dump(mode="json", by_alias=True),
        "planning_context": kwargs["planning_context"].model_dump(mode="json", by_alias=True),
        "composition_context": None,
        "composition_saga_id": kwargs["saga_id"],
        "composition_saga_phase": "planning",
        "request_fingerprint": kwargs["fingerprint"],
    }


def _parent_values(**kwargs) -> dict[str, object]:
    authority = kwargs["authority"]
    payload = kwargs["payload"]
    return {
        "id": kwargs["saga_id"],
        "workspace_id": kwargs["workspace_id"],
        "project_id": kwargs["project_id"],
        "runtime_id": kwargs["runtime_id"],
        "site_id": kwargs["site_id"],
        "environment_id": kwargs["environment_id"],
        "actor_user_id": kwargs["actor_user_id"],
        "initial_site_revision_id": kwargs["revision"].id,
        "initial_manifest_hash": kwargs["manifest_hash"],
        "initial_etag": kwargs["manifest_hash"],
        "agent_run_id": authority.agent_run_id,
        "agent_id": authority.agent_id,
        "agent_version_id": authority.agent_version_id,
        "agent_assignment_id": authority.agent_assignment_id,
        "objective": payload.objective.strip(),
        "locale": payload.locale,
        "candidate_count": payload.candidate_count,
        "targets": [target.model_dump(mode="json", by_alias=True) for target in payload.targets],
        "planning_targets": [target.model_dump(mode="json", by_alias=True) for target in kwargs["planning_targets"]],
        "knowledge_reference_ids": [str(value) for value in payload.knowledge_reference_ids],
        "request_fingerprint": kwargs["fingerprint"],
        "status": BuilderCompositionSagaStatus.PLANNING_QUEUED,
        "planning_generation_id": kwargs["generation_id"],
    }


async def _write_created_activity(**kwargs) -> None:
    record = kwargs["record"]
    await write_required_activity_event(
        settings=kwargs["settings"],
        payload=ActivityAuditPayload(
            event_name="project.builder.composition_saga.created",
            organization_id=kwargs["organization_id"],
            workspace_id=kwargs["workspace_id"],
            project_id=kwargs["project_id"],
            actor_user_id=kwargs["actor_user_id"],
            entity_type="builder_composition_saga",
            entity_id=record.id,
            source="api",
            properties={
                "planningGenerationId": str(record.planning_generation_id),
                "planningJobId": str(kwargs["job_id"]),
                "targetCount": len(record.targets),
                "planningTargetCount": len(record.planning_targets),
                "initialRevisionId": str(record.initial_site_revision_id),
            },
        ),
        conn=kwargs["conn"],
    )


async def _write_completed_activity(**kwargs) -> None:
    record = kwargs["record"]
    await write_required_activity_event(
        settings=kwargs["settings"],
        payload=ActivityAuditPayload(
            event_name="project.builder.composition_saga.completed",
            organization_id=kwargs["organization_id"],
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            actor_user_id=record.actor_user_id,
            entity_type="builder_composition_saga",
            entity_id=record.id,
            source="api",
            properties={
                "compositionGenerationId": str(record.composition_generation_id),
                "compositionChangeSetId": str(record.composition_change_set_id),
                "compositionResultRevisionId": str(record.composition_result_revision_id),
            },
        ),
        conn=kwargs["conn"],
    )


async def _write_cancelled_activity(**kwargs) -> None:
    record = kwargs["record"]
    await write_required_activity_event(
        settings=kwargs["settings"],
        payload=ActivityAuditPayload(
            event_name="project.builder.composition_saga.cancelled",
            organization_id=kwargs["organization_id"],
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            actor_user_id=record.actor_user_id,
            entity_type="builder_composition_saga",
            entity_id=record.id,
            source="api",
            properties={
                "phase": kwargs["phase"],
                "reason": record.cancel_reason,
            },
        ),
        conn=kwargs["conn"],
    )


async def _write_cancellation_requested_activity(**kwargs) -> None:
    record = kwargs["record"]
    await write_required_activity_event(
        settings=kwargs["settings"],
        payload=ActivityAuditPayload(
            event_name="project.builder.composition_saga.cancellation_requested",
            organization_id=kwargs["organization_id"],
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            actor_user_id=record.actor_user_id,
            entity_type="builder_composition_saga",
            entity_id=record.id,
            source="api",
            properties={
                "phase": kwargs["phase"],
                "generationId": str(kwargs["generation_id"]),
                "jobId": str(kwargs["job_id"]),
                "reason": record.cancel_reason,
            },
        ),
        conn=kwargs["conn"],
    )


def _request_fingerprint(**kwargs) -> str:
    return builder_request_fingerprint({
        "workspaceId": str(kwargs["workspace_id"]),
        "projectId": str(kwargs["project_id"]),
        "runtimeId": str(kwargs["runtime_id"]),
        "actorUserId": str(kwargs["actor_user_id"]),
        **kwargs["payload"].model_dump(mode="json", by_alias=True),
    })


def _saga_identity(*, workspace_id: UUID, project_id: UUID, idempotency_key: str) -> UUID:
    digest = sha256(
        f"arclayer:builder-composition-saga:{workspace_id}:{project_id}:{idempotency_key}".encode()
    ).digest()
    return UUID(bytes=digest[:16], version=4)


def _planning_generation_identity(saga_id: UUID) -> UUID:
    digest = sha256(f"arclayer:builder-composition-saga:{saga_id}:planning".encode()).digest()
    return UUID(bytes=digest[:16], version=4)


def _active_child_identity(
    *,
    parent: BuilderCompositionSagaRecord,
    status: BuilderCompositionSagaStatus,
) -> tuple[Literal["planning", "composition"], UUID, str]:
    if status in {
        BuilderCompositionSagaStatus.PLANNING_QUEUED,
        BuilderCompositionSagaStatus.PLANNING_RUNNING,
    }:
        return "planning", parent.planning_generation_id, BUILDER_PLANNING_GENERATION_JOB_TYPE
    if (
        status
        in {
            BuilderCompositionSagaStatus.COMPOSITION_QUEUED,
            BuilderCompositionSagaStatus.COMPOSITION_RUNNING,
        }
        and parent.composition_generation_id is not None
    ):
        return "composition", parent.composition_generation_id, BUILDER_WIREFRAME_GENERATION_JOB_TYPE
    _raise_conflict("BUILDER_COMPOSITION_SAGA_PHASE_CONFLICT")


def _is_exact_active_child(
    *,
    parent: BuilderCompositionSagaRecord,
    generation: BuilderGenerationRecord | None,
    generation_id: UUID,
    phase: Literal["planning", "composition"],
) -> bool:
    return bool(
        generation is not None
        and generation.id == generation_id
        and generation.project_id == parent.project_id
        and generation.actor_user_id == parent.actor_user_id
        and generation.composition_saga_id == parent.id
        and generation.composition_saga_phase == phase
        and BuilderGenerationStatus(str(generation.status))
        in {BuilderGenerationStatus.QUEUED, BuilderGenerationStatus.RUNNING}
    )


def _is_planning_transition_replay(
    *,
    parent: BuilderCompositionSagaRecord,
    payload: BuilderCompositionSagaPhaseTransitionRequest,
) -> bool:
    persisted = (
        parent.planning_change_set_id,
        parent.planning_result_revision_id,
        parent.composition_generation_id,
    )
    if persisted == (None, None, None):
        return False
    if (
        persisted
        == (
            UUID(str(payload.applied_change_set_id)),
            UUID(str(payload.applied_site_revision_id)),
            parent.composition_generation_id,
        )
        and parent.composition_generation_id is not None
    ):
        return True
    _raise_conflict("BUILDER_COMPOSITION_SAGA_PHASE_CONFLICT")


def _is_composition_transition_replay(
    *,
    parent: BuilderCompositionSagaRecord,
    payload: BuilderCompositionSagaPhaseTransitionRequest,
) -> bool:
    persisted = (parent.composition_change_set_id, parent.composition_result_revision_id)
    if persisted == (None, None):
        return False
    if (
        persisted
        == (
            UUID(str(payload.applied_change_set_id)),
            UUID(str(payload.applied_site_revision_id)),
        )
        and BuilderCompositionSagaStatus(str(parent.status)) is BuilderCompositionSagaStatus.COMPLETED
    ):
        return True
    _raise_conflict("BUILDER_COMPOSITION_SAGA_PHASE_CONFLICT")


def _is_exact_child_candidate(
    *,
    parent: BuilderCompositionSagaRecord,
    generation: BuilderGenerationRecord | None,
    generation_id: UUID,
    phase: Literal["planning", "composition"],
    change_set_id: UUID,
) -> bool:
    if (
        generation is None
        or generation.id != generation_id
        or generation.project_id != parent.project_id
        or generation.composition_saga_id != parent.id
        or generation.composition_saga_phase != phase
        or BuilderGenerationStatus(str(generation.status))
        not in {BuilderGenerationStatus.SUCCEEDED, BuilderGenerationStatus.PARTIAL}
    ):
        return False
    return any(
        isinstance(candidate, dict) and candidate.get("changeSetId") == str(change_set_id)
        for candidate in generation.candidates
    )


def _is_exact_applied_change_set(
    *,
    parent: BuilderCompositionSagaRecord,
    change_set,
    base_revision_id: UUID,
    revision_id: UUID,
) -> bool:
    return bool(
        change_set is not None
        and change_set.project_id == parent.project_id
        and change_set.site_id == parent.site_id
        and change_set.environment_id == parent.environment_id
        and change_set.base_site_revision_id == base_revision_id
        and BuilderChangeSetStatus(str(change_set.status)) is BuilderChangeSetStatus.APPLIED
        and change_set.applied_site_revision_id == revision_id
    )


def _is_exact_result_revision(
    *,
    parent: BuilderCompositionSagaRecord,
    revision,
    latest,
    base_revision_id: UUID,
) -> bool:
    return bool(
        revision is not None
        and latest is not None
        and latest.id == revision.id
        and revision.workspace_id == parent.workspace_id
        and revision.project_id == parent.project_id
        and revision.site_id == parent.site_id
        and revision.environment_id == parent.environment_id
        and revision.base_revision_id == base_revision_id
    )


def _current_phase(status: BuilderCompositionSagaStatus) -> Literal["planning", "composition", "completed"]:
    if status in {BuilderCompositionSagaStatus.COMPLETED}:
        return "completed"
    if status in {
        BuilderCompositionSagaStatus.COMPOSITION_QUEUED,
        BuilderCompositionSagaStatus.COMPOSITION_RUNNING,
        BuilderCompositionSagaStatus.COMPOSITION_REVIEW_PENDING,
    }:
        return "composition"
    return "planning"


def _dump(value: BaseSchema) -> JsonObject:
    return cast(JsonObject, value.model_dump(mode="json", by_alias=True))


def _raise_not_found(code: str) -> NoReturn:
    raise NotFound(error=code, message=t("errors", code))


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = ["BuilderCompositionSagaService"]
