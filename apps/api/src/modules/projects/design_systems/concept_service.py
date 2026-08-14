from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import NoReturn, cast
from uuid import UUID

import orjson
from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.events import events
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.agents.runtime_v1 import AgentExecutionModeV1
from src.models.design_systems._enums import (
    DesignSystemConceptGenerationStatus,
    DesignSystemOwnerKind,
)
from src.models.design_systems.concept_generation import DesignSystemConceptGenerationRecord
from src.models.jobs.background_job import BackgroundJobRecord, JobAuthorityMode, JobInternalStatus
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_builder_context_service import AgentBuilderContextResolver
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.ai.agent_design_system_context_service import AgentDesignSystemContextResolver
from src.modules.ai.agent_tool_grants import BUILDER_STYLE_GUIDE_GENERATE_TOOL
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.jobs.workspace_schema import JobPublicStatus
from src.modules.projects.builder.authority import require_builder_authority
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.concept_job_contract import (
    DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE,
    DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE_VERSION,
    DesignSystemConceptGenerationJobInput,
    DesignSystemConceptGenerationJobTarget,
)
from src.modules.projects.design_systems.concept_repository import (
    DesignSystemConceptGenerationRepository,
)
from src.modules.projects.design_systems.concept_schema import (
    DesignSystemConceptFeedbackEntryOut,
    DesignSystemConceptGenerationCancelRequest,
    DesignSystemConceptGenerationCandidateOut,
    DesignSystemConceptGenerationCreateRequest,
    DesignSystemConceptGenerationFailureOut,
    DesignSystemConceptGenerationFeedbackRequest,
    DesignSystemConceptGenerationOut,
    DesignSystemConceptGenerationRecoveryOut,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.workspaces.design_systems.projection import project_validation, project_version_detail


class _ResolvedConceptAuthority(BaseSchema):
    agent_run_id: UUID | None
    agent_id: UUID
    agent_version_id: UUID
    agent_assignment_id: UUID
    design_system_context: AgentRunDesignSystemContextV1
    builder_context: AgentRunBuilderContextV1


_ACTIVE_GENERATION_STATUSES = (
    DesignSystemConceptGenerationStatus.QUEUED,
    DesignSystemConceptGenerationStatus.RUNNING,
)
_TERMINAL_GENERATION_STATUSES = (
    DesignSystemConceptGenerationStatus.PARTIAL,
    DesignSystemConceptGenerationStatus.SUCCEEDED,
    DesignSystemConceptGenerationStatus.FAILED,
    DesignSystemConceptGenerationStatus.CANCELLED,
)


class DesignSystemConceptGenerationService(BaseService):
    def __init__(
        self,
        *,
        repository: DesignSystemConceptGenerationRepository,
        design_system_repository: ProjectDesignSystemsRepository,
        builder_repository: SiteBuilderRepository,
        settings: Settings | None = None,
        job_service: BackgroundJobService | None = None,
        agent_catalog_service: AgentCatalogService | None = None,
        design_system_context_resolver: AgentDesignSystemContextResolver | None = None,
        builder_context_resolver: AgentBuilderContextResolver | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=events, default_event_source="design_system_concept_generation")
        self._repository = repository
        self._design_systems = design_system_repository
        self._builder = builder_repository
        self._jobs = job_service or BackgroundJobService(self.settings)
        self._agents = agent_catalog_service or AgentCatalogService(self.settings)
        self._design_contexts = design_system_context_resolver or AgentDesignSystemContextResolver(
            repository=design_system_repository
        )
        self._builder_contexts = builder_context_resolver or AgentBuilderContextResolver(repository=builder_repository)

    async def create(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        design_system_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: DesignSystemConceptGenerationCreateRequest,
    ) -> DesignSystemConceptGenerationOut:
        key = _require_idempotency_key(idempotency_key)
        generation_id = _generation_identity(
            workspace_id=workspace_id,
            project_id=project_id,
            design_system_id=design_system_id,
            idempotency_key=key,
        )
        fingerprint = _request_fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "designSystemId": str(design_system_id),
            "actorUserId": str(actor_user_id),
            **payload.model_dump(mode="json", by_alias=True),
        })
        if payload.agent_id is not None:
            await self._agents.ensure_official_assignments(workspace_id=workspace_id)
        job_result: BackgroundJobCreateResult | None = None
        async with self.tx() as conn:
            project = await self._builder.lock_project(
                project_id=project_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if project is None:
                _raise_not_found("PROJECT_NOT_FOUND")
            require_builder_authority(project)
            existing = await self._repository.get_generation(
                project_id=project_id,
                design_system_id=design_system_id,
                generation_id=generation_id,
                conn=conn,
                for_update=True,
            )
            if existing is not None:
                if existing.request_fingerprint != fingerprint or existing.actor_user_id != actor_user_id:
                    _raise_conflict("DESIGN_SYSTEM_CONCEPT_GENERATION_IDEMPOTENCY_CONFLICT")
                return await self._project(record=existing, actor_user_id=actor_user_id, conn=conn)
            await self._require_base(
                workspace_id=workspace_id,
                project_id=project_id,
                design_system_id=design_system_id,
                payload=payload,
                conn=conn,
            )
            authority = await self._resolve_agent_authority(
                workspace_id=workspace_id,
                project_id=project_id,
                design_system_id=design_system_id,
                actor_user_id=actor_user_id,
                payload=payload,
                conn=conn,
            )
            job_result = await self._jobs.create_job_in_transaction(
                command=self._job_command(
                    generation_id=generation_id,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    design_system_id=design_system_id,
                    actor_user_id=actor_user_id,
                    request_fingerprint=fingerprint,
                    payload=payload,
                    authority=authority,
                ),
                conn=conn,
            )
            record = await self._repository.create_generation(
                values={
                    "id": generation_id,
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                    "design_system_id": design_system_id,
                    "base_version_id": UUID(str(payload.base_version_id)),
                    "base_manifest_checksum": payload.expected_base_checksum,
                    "base_site_revision_id": UUID(str(payload.base_revision_id)),
                    "base_etag": payload.base_etag,
                    "job_id": job_result.job.id,
                    "actor_user_id": actor_user_id,
                    "agent_run_id": authority.agent_run_id,
                    "agent_id": authority.agent_id,
                    "agent_version_id": authority.agent_version_id,
                    "agent_assignment_id": authority.agent_assignment_id,
                    "design_system_context": authority.design_system_context.model_dump(mode="json", by_alias=True),
                    "builder_context": authority.builder_context.model_dump(mode="json", by_alias=True),
                    "tool_name": BUILDER_STYLE_GUIDE_GENERATE_TOOL,
                    "objective": payload.objective.strip(),
                    "locale": payload.locale,
                    "candidate_count": payload.candidate_count,
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            await self._write_created_activity(
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                record=record,
                candidate_count=payload.candidate_count,
                conn=conn,
            )
            result = await self._project(record=record, actor_user_id=actor_user_id, conn=conn)
        if job_result is not None:
            await self._jobs.publish_created_after_commit(job_result)
        return result

    async def get(
        self,
        *,
        project_id: UUID,
        design_system_id: UUID,
        actor_user_id: UUID,
        generation_id: UUID,
    ) -> DesignSystemConceptGenerationOut:
        async with self.tx() as conn:
            record = await self._require_owned(
                project_id=project_id,
                design_system_id=design_system_id,
                actor_user_id=actor_user_id,
                generation_id=generation_id,
                conn=conn,
            )
            return await self._project(record=record, actor_user_id=actor_user_id, conn=conn)

    async def submit_feedback(
        self,
        *,
        project_id: UUID,
        design_system_id: UUID,
        actor_user_id: UUID,
        generation_id: UUID,
        payload: DesignSystemConceptGenerationFeedbackRequest,
    ) -> DesignSystemConceptGenerationOut:
        comment = payload.comment.strip()
        if not comment:
            _raise_conflict("DESIGN_SYSTEM_CONCEPT_FEEDBACK_INVALID")
        async with self.tx() as conn:
            record = await self._require_owned(
                project_id=project_id,
                design_system_id=design_system_id,
                actor_user_id=actor_user_id,
                generation_id=generation_id,
                conn=conn,
                for_update=True,
            )
            candidates = record.candidates if isinstance(record.candidates, list) else []
            target: dict | None = None
            for raw in candidates:
                if isinstance(raw, dict) and raw.get("candidateIndex") == payload.concept_index:
                    target = raw
                    break
            if target is None:
                _raise_not_found("DESIGN_SYSTEM_CONCEPT_GENERATION_CANDIDATE_NOT_FOUND")
            entries = target.get("feedback")
            if not isinstance(entries, list):
                entries = []
            entries = [
                *entries,
                {
                    "comment": comment,
                    "actorUserId": str(actor_user_id),
                    "createdAt": datetime.now(UTC).isoformat(),
                },
            ]
            target["feedback"] = entries
            await self._repository.update_generation(
                record=record,
                values={"candidates": candidates},
                conn=conn,
            )
            return await self._project(record=record, actor_user_id=actor_user_id, conn=conn)

    async def recover(
        self,
        *,
        project_id: UUID,
        design_system_id: UUID,
        actor_user_id: UUID,
    ) -> DesignSystemConceptGenerationRecoveryOut:
        async with self.tx() as conn:
            active_record = await self._repository.get_latest_generation(
                project_id=project_id,
                design_system_id=design_system_id,
                actor_user_id=actor_user_id,
                statuses=_ACTIVE_GENERATION_STATUSES,
                conn=conn,
            )
            terminal_record = await self._repository.get_latest_generation(
                project_id=project_id,
                design_system_id=design_system_id,
                actor_user_id=actor_user_id,
                statuses=_TERMINAL_GENERATION_STATUSES,
                conn=conn,
            )
            active = (
                await self._project(record=active_record, actor_user_id=actor_user_id, conn=conn)
                if active_record is not None
                else None
            )
            latest_terminal = (
                await self._project(record=terminal_record, actor_user_id=actor_user_id, conn=conn)
                if terminal_record is not None
                else None
            )
            return DesignSystemConceptGenerationRecoveryOut(
                active=active,
                latest_terminal=latest_terminal,
            )

    async def cancel(
        self,
        *,
        project_id: UUID,
        design_system_id: UUID,
        actor_user_id: UUID,
        generation_id: UUID,
        payload: DesignSystemConceptGenerationCancelRequest,
    ) -> DesignSystemConceptGenerationOut:
        now = datetime.now(UTC)
        async with self.tx() as conn:
            record = await self._require_owned(
                project_id=project_id,
                design_system_id=design_system_id,
                actor_user_id=actor_user_id,
                generation_id=generation_id,
                conn=conn,
                for_update=True,
            )
            job = await self._repository.get_job(job_id=record.job_id, conn=conn, for_update=True)
            if job is None or job.job_type != DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE:
                _raise_conflict("DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_INVALID")
            definition = self._jobs.registry.require(job_type=job.job_type, job_type_version=job.job_type_version)
            if job.internal_status not in _TERMINAL_JOB_STATUSES and job.phase not in definition.cancellable_phases:
                _raise_conflict("BACKGROUND_JOB_NOT_CANCELLABLE")
            job, requested = await self._jobs.request_cancellation_in_transaction(
                job_id=job.id,
                requested_by_user_id=actor_user_id,
                reason=payload.reason.strip() if payload.reason and payload.reason.strip() else None,
                requested_at=now,
                conn=conn,
            )
            result = await self._project(record=record, actor_user_id=actor_user_id, conn=conn, job=job)
        await self._jobs.publish_cancellation_requested_after_commit(job=job, requested=requested)
        return result

    async def _require_base(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        design_system_id: UUID,
        payload: DesignSystemConceptGenerationCreateRequest,
        conn: BaseDBAsyncClient,
    ) -> None:
        system = await self._design_systems.get_system(
            workspace_id=workspace_id,
            system_id=design_system_id,
            conn=conn,
            for_update=True,
        )
        if (
            system is None
            or DesignSystemOwnerKind(str(system.owner_kind)) is not DesignSystemOwnerKind.PROJECT
            or system.owning_project_id != project_id
        ):
            _raise_not_found("DESIGN_SYSTEM_NOT_FOUND")
        version_id = UUID(str(payload.base_version_id))
        version = await self._design_systems.get_version(
            workspace_id=workspace_id,
            system_id=design_system_id,
            version_id=version_id,
            conn=conn,
        )
        assignment = await self._design_systems.get_assignment(project_id=project_id, conn=conn, for_update=True)
        revision = await self._builder.get_site_revision(
            project_id=project_id,
            revision_id=UUID(str(payload.base_revision_id)),
            conn=conn,
            for_update=True,
        )
        if version is None or revision is None:
            _raise_not_found("DESIGN_SYSTEM_NOT_FOUND")
        latest = await self._builder.get_latest_site_revision(
            project_id=project_id,
            site_id=revision.site_id,
            environment_id=revision.environment_id,
            conn=conn,
            for_update=True,
        )
        if (
            version.manifest_checksum != payload.expected_base_checksum
            or assignment is None
            or assignment.design_system_id != design_system_id
            or assignment.design_system_version_id != version_id
            or assignment.manifest_checksum != payload.expected_base_checksum
            or revision.workspace_id != workspace_id
            or revision.manifest_hash != payload.base_etag
            or latest is None
            or latest.id != revision.id
        ):
            _raise_conflict("DESIGN_SYSTEM_REVISION_CONFLICT")

    async def _resolve_agent_authority(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        design_system_id: UUID,
        actor_user_id: UUID,
        payload: DesignSystemConceptGenerationCreateRequest,
        conn: BaseDBAsyncClient,
    ) -> _ResolvedConceptAuthority:
        if payload.agent_run_id is None:
            return await self._resolve_direct_agent_authority(
                workspace_id=workspace_id,
                project_id=project_id,
                design_system_id=design_system_id,
                payload=payload,
                conn=conn,
            )
        run_id = UUID(str(payload.agent_run_id))
        version_id = UUID(str(payload.base_version_id))
        revision_id = UUID(str(payload.base_revision_id))
        run = await self._builder.get_agent_run_for_builder(
            run_id=run_id,
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            conn=conn,
        )
        design_snapshot = await self._repository.get_design_system_snapshot(run_id=run_id, conn=conn)
        builder_snapshot = await self._repository.get_builder_snapshot(run_id=run_id, conn=conn)
        if (
            run is None
            or run.lead_agent_id is None
            or run.lead_agent_version_id is None
            or run.lead_agent_assignment_id is None
            or design_snapshot is None
            or builder_snapshot is None
        ):
            _raise_conflict("AGENT_DESIGN_SYSTEM_SNAPSHOT_MISSING")
        try:
            design_context = AgentRunDesignSystemContextV1.model_validate(design_snapshot.context_snapshot)
            builder_context = AgentRunBuilderContextV1.model_validate(builder_snapshot.context_snapshot)
            execution_mode = AgentExecutionModeV1(str(run.execution_mode))
        except ValueError:
            _raise_conflict("AGENT_DESIGN_SYSTEM_SNAPSHOT_INVALID")
        if (
            execution_mode is not AgentExecutionModeV1.BUILD
            or run.site_revision_id != revision_id
            or design_snapshot.project_id != project_id
            or design_snapshot.design_system_id != design_system_id
            or design_snapshot.design_system_version_id != version_id
            or design_snapshot.manifest_checksum != payload.expected_base_checksum
            or design_context.context_hash != design_snapshot.context_hash
            or UUID(str(design_context.project_id)) != project_id
            or UUID(str(design_context.design_system_id)) != design_system_id
            or UUID(str(design_context.version_id)) != version_id
            or design_context.manifest_checksum != payload.expected_base_checksum
            or builder_snapshot.workspace_id != workspace_id
            or builder_snapshot.project_id != project_id
            or builder_snapshot.site_revision_id != revision_id
            or builder_snapshot.manifest_hash != payload.base_etag
            or builder_context.context_hash != builder_snapshot.context_hash
            or UUID(str(builder_context.site_revision_id)) != revision_id
            or builder_context.manifest_hash != payload.base_etag
        ):
            _raise_conflict("AGENT_DESIGN_SYSTEM_SNAPSHOT_INVALID")
        resolved_agent = await self._agents.resolve_lead(
            workspace_id=workspace_id,
            project_id=project_id,
            agent_id=run.lead_agent_id,
            execution_mode="build",
            conn=conn,
            ensure_catalog=False,
        )
        if (
            resolved_agent.version_id != run.lead_agent_version_id
            or resolved_agent.assignment_id != run.lead_agent_assignment_id
            or BUILDER_STYLE_GUIDE_GENERATE_TOOL not in resolved_agent.tool_grants
        ):
            _raise_conflict("AGENT_BUILDER_TOOL_NOT_GRANTED")
        return _ResolvedConceptAuthority(
            agent_run_id=run_id,
            agent_id=resolved_agent.agent_id,
            agent_version_id=resolved_agent.version_id,
            agent_assignment_id=resolved_agent.assignment_id,
            design_system_context=design_context,
            builder_context=builder_context,
        )

    async def _resolve_direct_agent_authority(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        design_system_id: UUID,
        payload: DesignSystemConceptGenerationCreateRequest,
        conn: BaseDBAsyncClient,
    ) -> _ResolvedConceptAuthority:
        assert payload.agent_id is not None
        resolved_agent = await self._agents.resolve_lead(
            workspace_id=workspace_id,
            project_id=project_id,
            agent_id=UUID(str(payload.agent_id)),
            execution_mode="build",
            conn=conn,
            ensure_catalog=False,
        )
        if BUILDER_STYLE_GUIDE_GENERATE_TOOL not in resolved_agent.tool_grants:
            _raise_conflict("AGENT_BUILDER_TOOL_NOT_GRANTED")
        design = await self._design_contexts.resolve_run_context(
            workspace_id=workspace_id,
            project_id=project_id,
            conn=conn,
        )
        builder = await self._builder_contexts.resolve_run_context(
            workspace_id=workspace_id,
            project_id=project_id,
            site_revision_id=UUID(str(payload.base_revision_id)),
            conn=conn,
        )
        self._require_direct_context_binding(
            design_system_id=design_system_id,
            payload=payload,
            design=design.context,
            builder=builder.context,
        )
        return _ResolvedConceptAuthority(
            agent_run_id=None,
            agent_id=resolved_agent.agent_id,
            agent_version_id=resolved_agent.version_id,
            agent_assignment_id=resolved_agent.assignment_id,
            design_system_context=design.context,
            builder_context=builder.context,
        )

    @staticmethod
    def _require_direct_context_binding(
        *,
        design_system_id: UUID,
        payload: DesignSystemConceptGenerationCreateRequest,
        design: AgentRunDesignSystemContextV1,
        builder: AgentRunBuilderContextV1,
    ) -> None:
        if (
            UUID(str(design.design_system_id)) != design_system_id
            or design.version_id != payload.base_version_id
            or design.manifest_checksum != payload.expected_base_checksum
            or builder.site_revision_id != payload.base_revision_id
            or builder.manifest_hash != payload.base_etag
        ):
            _raise_conflict("AGENT_DESIGN_SYSTEM_SNAPSHOT_INVALID")

    def _job_command(
        self,
        *,
        generation_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        design_system_id: UUID,
        actor_user_id: UUID,
        request_fingerprint: str,
        payload: DesignSystemConceptGenerationCreateRequest,
        authority: _ResolvedConceptAuthority,
    ) -> BackgroundJobCreate:
        definition = self._jobs.registry.require(
            job_type=DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE,
            job_type_version=DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE_VERSION,
        )
        target = DesignSystemConceptGenerationJobTarget(
            workspace_id=workspace_id,
            project_id=project_id,
            design_system_id=design_system_id,
        )
        input_reference = DesignSystemConceptGenerationJobInput(
            generation_id=generation_id,
            base_version_id=payload.base_version_id,
            base_site_revision_id=payload.base_revision_id,
            agent_run_id=authority.agent_run_id,
            agent_version_id=authority.agent_version_id,
            request_hash=request_fingerprint,
        )
        return BackgroundJobCreate(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=None,
            actor_user_id=actor_user_id,
            target_descriptor=_dump(target),
            input_reference=_dump(input_reference),
            idempotency_key=f"design-system-concept-generation:{project_id}:{generation_id}",
            source_revision=payload.expected_base_checksum,
            correlation_id=correlation_id.get(None) or generation_id.hex,
            trace_id=correlation_id.get(None),
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            status_key=definition.initial_status_key,
        )

    async def _write_created_activity(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        record: DesignSystemConceptGenerationRecord,
        candidate_count: int,
        conn: BaseDBAsyncClient,
    ) -> None:
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name="project.design_system.concept_generation.created",
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                entity_type="design_system_concept_generation",
                entity_id=record.id,
                source="api",
                properties={
                    "jobId": str(record.job_id),
                    "designSystemId": str(record.design_system_id),
                    "baseVersionId": str(record.base_version_id),
                    "baseRevisionId": str(record.base_site_revision_id),
                    "candidateCount": candidate_count,
                    "agentRunId": str(record.agent_run_id) if record.agent_run_id is not None else None,
                    "agentId": str(record.agent_id),
                    "agentVersionId": str(record.agent_version_id),
                    "agentAssignmentId": str(record.agent_assignment_id),
                },
            ),
            conn=conn,
        )

    async def _require_owned(
        self,
        *,
        project_id: UUID,
        design_system_id: UUID,
        actor_user_id: UUID,
        generation_id: UUID,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> DesignSystemConceptGenerationRecord:
        record = await self._repository.get_generation(
            project_id=project_id,
            design_system_id=design_system_id,
            generation_id=generation_id,
            conn=conn,
            for_update=for_update,
        )
        if record is None or record.actor_user_id != actor_user_id:
            _raise_not_found("DESIGN_SYSTEM_CONCEPT_GENERATION_NOT_FOUND")
        return record

    async def _project(
        self,
        *,
        record: DesignSystemConceptGenerationRecord,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
        job: BackgroundJobRecord | None = None,
    ) -> DesignSystemConceptGenerationOut:
        if record.actor_user_id != actor_user_id:
            _raise_not_found("DESIGN_SYSTEM_CONCEPT_GENERATION_NOT_FOUND")
        resolved_job = job or await self._repository.get_job(job_id=record.job_id, conn=conn)
        if resolved_job is None or resolved_job.job_type != DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE:
            _raise_conflict("DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_INVALID")
        candidates = await self._project_candidates(record=record, conn=conn)
        failures = tuple(
            DesignSystemConceptGenerationFailureOut.model_validate(item)
            for item in (record.failures if isinstance(record.failures, list) else [])
        )
        return DesignSystemConceptGenerationOut(
            generation_id=record.id,
            job_id=resolved_job.id,
            design_system_id=record.design_system_id,
            base_version_id=record.base_version_id,
            base_revision_id=record.base_site_revision_id,
            agent_run_id=record.agent_run_id,
            agent_id=record.agent_id,
            agent_version_id=record.agent_version_id,
            agent_assignment_id=record.agent_assignment_id,
            status=DesignSystemConceptGenerationStatus(str(record.status)),
            job_status=_public_job_status(JobInternalStatus(str(resolved_job.internal_status))),
            phase=resolved_job.phase,
            status_key=resolved_job.status_key,
            progress_completed=resolved_job.progress_completed,
            progress_total=resolved_job.progress_total,
            candidates=candidates,
            failures=failures,
            cancel_requested_at=resolved_job.cancel_requested_at,
            cancellation_acknowledged_at=resolved_job.cancellation_acknowledged_at,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    async def _project_candidates(
        self,
        *,
        record: DesignSystemConceptGenerationRecord,
        conn: BaseDBAsyncClient,
    ) -> tuple[DesignSystemConceptGenerationCandidateOut, ...]:
        projected: list[DesignSystemConceptGenerationCandidateOut] = []
        for raw in record.candidates if isinstance(record.candidates, list) else []:
            if not isinstance(raw, dict):
                _raise_conflict("DESIGN_SYSTEM_CONCEPT_GENERATION_RESULT_INVALID")
            index = raw.get("candidateIndex")
            summary = raw.get("summary")
            version_id = raw.get("versionId")
            validation_id = raw.get("validationId")
            if (
                not isinstance(index, int)
                or not isinstance(summary, str)
                or not isinstance(version_id, str)
                or not isinstance(validation_id, str)
            ):
                _raise_conflict("DESIGN_SYSTEM_CONCEPT_GENERATION_RESULT_INVALID")
            version_uuid = UUID(version_id)
            validation_uuid = UUID(validation_id)
            version = await self._design_systems.get_version(
                workspace_id=record.workspace_id,
                system_id=record.design_system_id,
                version_id=version_uuid,
                conn=conn,
            )
            state = await self._design_systems.get_version_state(
                workspace_id=record.workspace_id,
                version_id=version_uuid,
                conn=conn,
            )
            validation = await self._design_systems.get_validation(
                workspace_id=record.workspace_id,
                version_id=version_uuid,
                validation_id=validation_uuid,
                conn=conn,
            )
            if version is None or state is None or validation is None:
                _raise_conflict("DESIGN_SYSTEM_CONCEPT_GENERATION_RESULT_INVALID")
            projected.append(
                DesignSystemConceptGenerationCandidateOut(
                    candidate_index=index,
                    summary=summary,
                    version=project_version_detail(version, validation=validation, lifecycle_state=state),
                    validation=project_validation(validation),
                    feedback=_project_feedback(raw.get("feedback")),
                )
            )
        return tuple(projected)


def _project_feedback(value: object) -> tuple[DesignSystemConceptFeedbackEntryOut, ...]:
    if not isinstance(value, list):
        return ()
    projected: list[DesignSystemConceptFeedbackEntryOut] = []
    for item in value:
        if not isinstance(item, dict):
            _raise_conflict("DESIGN_SYSTEM_CONCEPT_GENERATION_RESULT_INVALID")
        comment = item.get("comment")
        actor_user_id = item.get("actorUserId")
        created_at = item.get("createdAt")
        if not isinstance(comment, str) or not isinstance(actor_user_id, str) or not isinstance(created_at, str):
            _raise_conflict("DESIGN_SYSTEM_CONCEPT_GENERATION_RESULT_INVALID")
        projected.append(
            DesignSystemConceptFeedbackEntryOut(
                comment=comment,
                actor_user_id=UUID(actor_user_id),
                created_at=datetime.fromisoformat(created_at),
            )
        )
    return tuple(projected)


_TERMINAL_JOB_STATUSES = frozenset({
    JobInternalStatus.SUCCEEDED,
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
})


def _public_job_status(status: JobInternalStatus) -> JobPublicStatus:
    if status in {JobInternalStatus.PENDING_DISPATCH, JobInternalStatus.QUEUED, JobInternalStatus.RETRY_SCHEDULED}:
        return JobPublicStatus.QUEUED
    if status == JobInternalStatus.RUNNING:
        return JobPublicStatus.RUNNING
    if status == JobInternalStatus.WAITING_FOR_USER:
        return JobPublicStatus.WAITING_FOR_USER
    if status == JobInternalStatus.SUCCEEDED:
        return JobPublicStatus.SUCCEEDED
    if status == JobInternalStatus.CANCELLED:
        return JobPublicStatus.CANCELLED
    return JobPublicStatus.FAILED


def _dump(value: BaseSchema) -> JsonObject:
    return cast(JsonObject, value.model_dump(mode="json", by_alias=True))


def _require_idempotency_key(value: str) -> str:
    key = value.strip()
    if not key or len(key) > 128:
        _raise_conflict("DESIGN_SYSTEM_IDEMPOTENCY_INVALID")
    return key


def _request_fingerprint(value: JsonObject) -> str:
    return hashlib.sha256(orjson.dumps(value, option=orjson.OPT_SORT_KEYS)).hexdigest()


def _generation_identity(
    *,
    workspace_id: UUID,
    project_id: UUID,
    design_system_id: UUID,
    idempotency_key: str,
) -> UUID:
    digest = hashlib.sha256(
        f"arclayer:design-system-concept-generation:{workspace_id}:{project_id}:{design_system_id}:{idempotency_key}".encode()
    ).digest()
    return UUID(bytes=digest[:16], version=4)


def _raise_not_found(code: str) -> NoReturn:
    raise NotFound(error=code, message=t("errors", code))


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))
