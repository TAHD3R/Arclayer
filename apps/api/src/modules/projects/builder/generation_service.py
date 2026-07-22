from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import NoReturn, cast
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
from src.models.agents.runtime_v1 import AgentExecutionModeV1
from src.models.builder._enums import BuilderChangeSetCommandKind, BuilderGenerationStatus
from src.models.builder.site_revision import SiteRevisionManifestRecord
from src.models.jobs.background_job import BackgroundJobRecord, JobAuthorityMode, JobInternalStatus
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_builder_context_service import AgentBuilderContextResolver
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_tool_grants import (
    BUILDER_DESIGN_GENERATE_TOOL,
    BUILDER_SITEMAP_GENERATE_TOOL,
    BUILDER_WIREFRAME_GENERATE_TOOL,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService
from src.modules.jobs.workspace_schema import JobPublicStatus
from src.modules.projects.builder.authority import require_builder_authority
from src.modules.projects.builder.change_set_persistence import replay_builder_change_set_preview
from src.modules.projects.builder.command import builder_request_fingerprint, require_builder_idempotency_key
from src.modules.projects.builder.composition_saga_job_contract import BUILDER_PLANNING_GENERATION_JOB_TYPE
from src.modules.projects.builder.generation_authority import (
    BuilderGenerationAuthorityResolver,
    CanonicalBuilderGenerationAuthorityResolver,
    ResolvedBuilderGenerationAuthority,
)
from src.modules.projects.builder.generation_context import (
    resolve_design_generation_context,
    resolve_wireframe_generation_context,
)
from src.modules.projects.builder.generation_job_contract import (
    BUILDER_DESIGN_GENERATION_JOB_TYPE,
    BUILDER_DESIGN_GENERATION_JOB_TYPE_VERSION,
    BUILDER_GENERATION_JOB_TYPE,
    BUILDER_GENERATION_JOB_TYPE_VERSION,
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION,
    BuilderDesignGenerationJobInput,
    BuilderGenerationJobInput,
    BuilderGenerationJobTarget,
    BuilderWireframeGenerationJobInput,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import (
    BuilderGenerationCancelRequest,
    BuilderGenerationCandidateOut,
    BuilderGenerationCreateRequest,
    BuilderGenerationFailureOut,
    BuilderGenerationOut,
    BuilderGenerationRecoveryOut,
    BuilderGenerationTargetV1,
)
from src.modules.projects.builder.manifest import parse_site_revision_manifest
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver


class BuilderGenerationService(BaseService):
    def __init__(
        self,
        *,
        repository: BuilderGenerationRepository,
        builder_repository: SiteBuilderRepository,
        design_system_repository: ProjectDesignSystemsRepository | None = None,
        component_catalog_resolver: ComponentCatalogResolver | None = None,
        agent_catalog_service: AgentCatalogService | None = None,
        builder_context_resolver: AgentBuilderContextResolver | None = None,
        authority_resolver: BuilderGenerationAuthorityResolver | None = None,
        settings: Settings | None = None,
        job_service: BackgroundJobService | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=events, default_event_source="builder_generation")
        self._repository = repository
        self._builder_repository = builder_repository
        self._design_system_repository = design_system_repository
        self._component_catalog_resolver = component_catalog_resolver
        agents = agent_catalog_service or AgentCatalogService(self.settings)
        builder_contexts = builder_context_resolver or AgentBuilderContextResolver(repository=builder_repository)
        self._authority = authority_resolver or CanonicalBuilderGenerationAuthorityResolver(
            generation_repository=repository,
            builder_repository=builder_repository,
            agent_catalog_service=agents,
            builder_context_resolver=builder_contexts,
        )
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
        payload: BuilderGenerationCreateRequest,
    ) -> BuilderGenerationOut:
        key = require_builder_idempotency_key(idempotency_key)
        if runtime_id is None:
            _raise_conflict("PROJECT_RUNTIME_IDENTITY_REQUIRED")
        generation_id = _generation_identity(
            workspace_id=workspace_id,
            project_id=project_id,
            idempotency_key=key,
        )
        request_fingerprint = builder_request_fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "runtimeId": str(runtime_id),
            "actorUserId": str(actor_user_id),
            **payload.model_dump(mode="json", by_alias=True),
        })
        job_result: BackgroundJobCreateResult | None = None
        async with self.tx() as conn:
            project = await self._builder_repository.lock_project(
                project_id=project_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if project is None:
                _raise_not_found("PROJECT_NOT_FOUND")
            require_builder_authority(project)
            existing = await self._repository.get_generation(
                project_id=project_id,
                generation_id=generation_id,
                conn=conn,
                for_update=True,
            )
            if existing is not None:
                if existing.request_fingerprint != request_fingerprint or existing.actor_user_id != actor_user_id:
                    _raise_conflict("BUILDER_GENERATION_IDEMPOTENCY_CONFLICT")
                return await self._project(record=existing, actor_user_id=actor_user_id, conn=conn)
            revision, site_id, environment_id, base_manifest_hash = await self._resolve_base(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                payload=payload,
                conn=conn,
            )
            generation_authority: ResolvedBuilderGenerationAuthority | None = None
            composition_context = None
            design_context = None
            if payload.target_stage in {"wireframe", "design"}:
                if self._design_system_repository is None or self._component_catalog_resolver is None:
                    raise RuntimeError("Builder generation requires Design System and component catalog services")
                required_tool = (
                    BUILDER_WIREFRAME_GENERATE_TOOL
                    if payload.target_stage == "wireframe"
                    else BUILDER_DESIGN_GENERATE_TOOL
                )
                generation_authority = await self._authority.resolve(
                    workspace_id=workspace_id,
                    project_id=project_id,
                    actor_user_id=actor_user_id,
                    base_revision_id=revision.id,
                    base_etag=payload.base_etag,
                    agent_run_id=UUID(str(payload.agent_run_id)) if payload.agent_run_id else None,
                    agent_id=UUID(str(payload.agent_id)) if payload.agent_id else None,
                    required_tool_grants=(required_tool,),
                    conn=conn,
                )
                if payload.target_stage == "wireframe":
                    composition_context = await resolve_wireframe_generation_context(
                        builder_repository=self._builder_repository,
                        design_system_repository=self._design_system_repository,
                        component_catalog_resolver=self._component_catalog_resolver,
                        workspace_id=workspace_id,
                        project_id=project_id,
                        builder_context=generation_authority.builder_context,
                        targets=payload.targets,
                        conn=conn,
                    )
                else:
                    design_context = await resolve_design_generation_context(
                        builder_repository=self._builder_repository,
                        design_system_repository=self._design_system_repository,
                        component_catalog_resolver=self._component_catalog_resolver,
                        workspace_id=workspace_id,
                        project_id=project_id,
                        builder_context=generation_authority.builder_context,
                        targets=payload.targets,
                        conn=conn,
                    )
            else:
                if payload.agent_run_id is None:
                    _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
                await self._require_agent_authority(
                    workspace_id=workspace_id,
                    project_id=project_id,
                    actor_user_id=actor_user_id,
                    agent_run_id=UUID(str(payload.agent_run_id)),
                    base_revision_id=revision.id,
                    conn=conn,
                )
            job_result = await self._jobs.create_job_in_transaction(
                command=self._job_command(
                    generation_id=generation_id,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    runtime_id=runtime_id,
                    environment_id=environment_id,
                    actor_user_id=actor_user_id,
                    request_fingerprint=request_fingerprint,
                    source_revision=base_manifest_hash,
                    payload=payload,
                    agent_version_id=(
                        generation_authority.agent_version_id if generation_authority is not None else None
                    ),
                ),
                conn=conn,
            )
            record = await self._repository.create_generation(
                values={
                    "id": generation_id,
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                    "runtime_id": runtime_id,
                    "site_id": site_id,
                    "environment_id": environment_id,
                    "base_site_revision_id": revision.id,
                    "base_manifest_hash": base_manifest_hash,
                    "base_etag": payload.base_etag,
                    "job_id": job_result.job.id,
                    "actor_user_id": actor_user_id,
                    "agent_run_id": (
                        generation_authority.agent_run_id
                        if generation_authority is not None
                        else UUID(str(payload.agent_run_id))
                        if payload.agent_run_id is not None
                        else None
                    ),
                    "agent_id": generation_authority.agent_id if generation_authority is not None else None,
                    "agent_version_id": (
                        generation_authority.agent_version_id if generation_authority is not None else None
                    ),
                    "agent_assignment_id": (
                        generation_authority.agent_assignment_id if generation_authority is not None else None
                    ),
                    "tool_name": (
                        BUILDER_WIREFRAME_GENERATE_TOOL
                        if payload.target_stage == "wireframe"
                        else BUILDER_DESIGN_GENERATE_TOOL
                        if payload.target_stage == "design"
                        else BUILDER_SITEMAP_GENERATE_TOOL
                    ),
                    "target_stage": payload.target_stage,
                    "objective": payload.objective.strip(),
                    "locale": payload.locale,
                    "candidate_count": payload.candidate_count,
                    "targets": [target.model_dump(mode="json", by_alias=True) for target in payload.targets],
                    "knowledge_reference_ids": [str(value) for value in payload.knowledge_reference_ids],
                    "builder_context": (
                        generation_authority.builder_context.model_dump(mode="json", by_alias=True)
                        if generation_authority is not None
                        else None
                    ),
                    "composition_context": (
                        composition_context.model_dump(mode="json", by_alias=True)
                        if composition_context is not None
                        else None
                    ),
                    "design_context": (
                        design_context.model_dump(mode="json", by_alias=True) if design_context is not None else None
                    ),
                    "request_fingerprint": request_fingerprint,
                },
                conn=conn,
            )
            await write_required_activity_event(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name="project.builder.generation.created",
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    actor_user_id=actor_user_id,
                    entity_type="builder_generation",
                    entity_id=record.id,
                    source="api",
                    properties={
                        "jobId": str(job_result.job.id),
                        "targetStage": payload.target_stage,
                        "baseRevisionId": str(revision.id),
                        "baseManifestHash": base_manifest_hash,
                        "candidateCount": payload.candidate_count,
                        "targetCount": len(payload.targets),
                        "agentRunId": (
                            str(generation_authority.agent_run_id)
                            if generation_authority is not None and generation_authority.agent_run_id is not None
                            else str(payload.agent_run_id)
                            if payload.agent_run_id is not None
                            else None
                        ),
                        "agentId": (str(generation_authority.agent_id) if generation_authority is not None else None),
                        "agentVersionId": (
                            str(generation_authority.agent_version_id) if generation_authority is not None else None
                        ),
                        "agentAssignmentId": (
                            str(generation_authority.agent_assignment_id) if generation_authority is not None else None
                        ),
                    },
                ),
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
        actor_user_id: UUID,
        generation_id: UUID,
    ) -> BuilderGenerationOut:
        async with self.tx() as conn:
            record = await self._require_owned(
                project_id=project_id,
                actor_user_id=actor_user_id,
                generation_id=generation_id,
                conn=conn,
            )
            return await self._project(record=record, actor_user_id=actor_user_id, conn=conn)

    async def recover(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        target_stage: str,
        targets: tuple[BuilderGenerationTargetV1, ...],
    ) -> BuilderGenerationRecoveryOut:
        persisted_targets = [target.model_dump(mode="json", by_alias=True) for target in targets]
        active_record = await self._repository.get_latest_recovery_generation(
            project_id=project_id,
            actor_user_id=actor_user_id,
            target_stage=target_stage,
            targets=persisted_targets,
            statuses=(BuilderGenerationStatus.QUEUED, BuilderGenerationStatus.RUNNING),
        )
        terminal_record = await self._repository.get_latest_recovery_generation(
            project_id=project_id,
            actor_user_id=actor_user_id,
            target_stage=target_stage,
            targets=persisted_targets,
            statuses=(
                BuilderGenerationStatus.SUCCEEDED,
                BuilderGenerationStatus.PARTIAL,
                BuilderGenerationStatus.FAILED,
                BuilderGenerationStatus.CANCELLED,
            ),
        )
        async with self.tx() as conn:
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
        return BuilderGenerationRecoveryOut(active=active, latest_terminal=latest_terminal)

    async def cancel(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        generation_id: UUID,
        payload: BuilderGenerationCancelRequest,
    ) -> BuilderGenerationOut:
        now = datetime.now(UTC)
        async with self.tx() as conn:
            record = await self._require_owned(
                project_id=project_id,
                actor_user_id=actor_user_id,
                generation_id=generation_id,
                conn=conn,
                for_update=True,
            )
            job = await self._repository.get_job(job_id=record.job_id, conn=conn, for_update=True)
            if job is None or job.job_type != _generation_job_type(str(record.target_stage)):
                _raise_conflict("BUILDER_GENERATION_JOB_INVALID")
            definition = self._jobs.registry.require(
                job_type=job.job_type,
                job_type_version=job.job_type_version,
            )
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

    async def _resolve_base(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        payload: BuilderGenerationCreateRequest,
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
        if (
            site is None
            or environment is None
            or latest is None
            or latest.id != revision.id
            or payload.base_etag != manifest.manifest_hash
        ):
            _raise_conflict("SITE_REVISION_STALE")
        return revision, revision.site_id, revision.environment_id, manifest.manifest_hash

    async def _require_agent_authority(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        agent_run_id: UUID,
        base_revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        run = await self._builder_repository.get_agent_run_for_builder(
            run_id=agent_run_id,
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            conn=conn,
        )
        snapshot = await self._repository.get_agent_builder_snapshot(run_id=agent_run_id, conn=conn)
        if (
            run is None
            or run.site_revision_id != base_revision_id
            or run.lead_agent_version_id is None
            or snapshot is None
            or snapshot.site_revision_id != base_revision_id
        ):
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        try:
            context = AgentRunBuilderContextV1.model_validate(snapshot.context_snapshot)
            execution_mode = AgentExecutionModeV1(str(run.execution_mode))
        except ValueError:
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        if context.context_hash != snapshot.context_hash or execution_mode not in {
            AgentExecutionModeV1.PLAN,
            AgentExecutionModeV1.BUILD,
        }:
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        version = await self._builder_repository.get_agent_version_for_builder(
            version_id=run.lead_agent_version_id,
            conn=conn,
        )
        grants = set(version.tool_grants) if version is not None and isinstance(version.tool_grants, list) else set()
        if BUILDER_SITEMAP_GENERATE_TOOL not in grants:
            _raise_conflict("AGENT_BUILDER_TOOL_NOT_GRANTED")

    def _job_command(
        self,
        *,
        generation_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        environment_id: UUID,
        actor_user_id: UUID,
        request_fingerprint: str,
        source_revision: str,
        payload: BuilderGenerationCreateRequest,
        agent_version_id: UUID | None = None,
    ) -> BackgroundJobCreate:
        job_type = (
            BUILDER_WIREFRAME_GENERATION_JOB_TYPE
            if payload.target_stage == "wireframe"
            else BUILDER_DESIGN_GENERATION_JOB_TYPE
            if payload.target_stage == "design"
            else BUILDER_GENERATION_JOB_TYPE
        )
        job_type_version = (
            BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION
            if payload.target_stage == "wireframe"
            else BUILDER_DESIGN_GENERATION_JOB_TYPE_VERSION
            if payload.target_stage == "design"
            else BUILDER_GENERATION_JOB_TYPE_VERSION
        )
        definition = self._jobs.registry.require(
            job_type=job_type,
            job_type_version=job_type_version,
        )
        target = BuilderGenerationJobTarget(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            environment_id=environment_id,
        )
        if payload.target_stage in {"wireframe", "design"}:
            if agent_version_id is None:
                raise ValueError("Builder generation requires a resolved Agent version")
            input_reference = (
                BuilderWireframeGenerationJobInput(
                    generation_id=generation_id,
                    base_site_revision_id=payload.base_revision_id,
                    agent_version_id=agent_version_id,
                    request_hash=request_fingerprint,
                )
                if payload.target_stage == "wireframe"
                else BuilderDesignGenerationJobInput(
                    generation_id=generation_id,
                    base_site_revision_id=payload.base_revision_id,
                    agent_version_id=agent_version_id,
                    request_hash=request_fingerprint,
                )
            )
        else:
            if payload.agent_run_id is None:
                raise ValueError("Sitemap generation requires an Agent run")
            input_reference = BuilderGenerationJobInput(
                generation_id=generation_id,
                base_site_revision_id=payload.base_revision_id,
                agent_run_id=payload.agent_run_id,
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
            idempotency_key=f"builder-generation:{project_id}:{generation_id}",
            source_revision=source_revision,
            correlation_id=correlation_id.get(None) or generation_id.hex,
            trace_id=correlation_id.get(None),
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            status_key=definition.initial_status_key,
        )

    async def _require_owned(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        generation_id: UUID,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ):
        record = await self._repository.get_generation(
            project_id=project_id,
            generation_id=generation_id,
            conn=conn,
            for_update=for_update,
        )
        if record is None or record.actor_user_id != actor_user_id:
            _raise_not_found("BUILDER_GENERATION_NOT_FOUND")
        return record

    async def _project(
        self,
        *,
        record,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
        job: BackgroundJobRecord | None = None,
    ) -> BuilderGenerationOut:
        if record.actor_user_id != actor_user_id:
            _raise_not_found("BUILDER_GENERATION_NOT_FOUND")
        resolved_job = job or await self._repository.get_job(job_id=record.job_id, conn=conn)
        if resolved_job is None or resolved_job.job_type != _generation_job_type(str(record.target_stage)):
            _raise_conflict("BUILDER_GENERATION_JOB_INVALID")
        candidates: list[BuilderGenerationCandidateOut] = []
        for raw in record.candidates if isinstance(record.candidates, list) else []:
            if not isinstance(raw, dict):
                _raise_conflict("BUILDER_GENERATION_RESULT_INVALID")
            candidate_index = raw.get("candidateIndex")
            command_key = raw.get("commandKey")
            change_set_id = raw.get("changeSetId")
            if (
                not isinstance(candidate_index, int)
                or not isinstance(command_key, str)
                or not isinstance(change_set_id, str)
            ):
                _raise_conflict("BUILDER_GENERATION_RESULT_INVALID")
            command = await self._builder_repository.get_change_set_command(
                project_id=record.project_id,
                command_kind=BuilderChangeSetCommandKind.PREVIEW,
                idempotency_key=command_key,
                conn=conn,
            )
            if command is None or command.change_set_id != UUID(change_set_id):
                _raise_conflict("BUILDER_GENERATION_RESULT_INVALID")
            preview = await replay_builder_change_set_preview(
                repository=self._builder_repository,
                settings=self.settings,
                project_id=record.project_id,
                change_set_id=command.change_set_id,
                snapshot=cast(JsonObject, command.result_snapshot),
                conn=conn,
            )
            candidates.append(BuilderGenerationCandidateOut(candidate_index=candidate_index, change_set=preview))
        failures = tuple(
            BuilderGenerationFailureOut.model_validate(item)
            for item in (record.failures if isinstance(record.failures, list) else [])
        )
        return BuilderGenerationOut(
            generation_id=record.id,
            job_id=resolved_job.id,
            target_stage=record.target_stage,
            base_revision_id=record.base_site_revision_id,
            base_etag=record.base_etag,
            targets=tuple(BuilderGenerationTargetV1.model_validate(target) for target in record.targets),
            agent_run_id=record.agent_run_id,
            agent_id=record.agent_id,
            agent_version_id=record.agent_version_id,
            agent_assignment_id=record.agent_assignment_id,
            status=BuilderGenerationStatus(str(record.status)),
            job_status=_public_job_status(JobInternalStatus(str(resolved_job.internal_status))),
            phase=resolved_job.phase,
            status_key=resolved_job.status_key,
            progress_completed=resolved_job.progress_completed,
            progress_total=resolved_job.progress_total,
            candidates=tuple(candidates),
            failures=failures,
            cancel_requested_at=resolved_job.cancel_requested_at,
            cancellation_acknowledged_at=resolved_job.cancellation_acknowledged_at,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )


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


def _generation_job_type(target_stage: str) -> str:
    if target_stage == "sitemap":
        return BUILDER_GENERATION_JOB_TYPE
    if target_stage == "planning":
        return BUILDER_PLANNING_GENERATION_JOB_TYPE
    if target_stage == "wireframe":
        return BUILDER_WIREFRAME_GENERATION_JOB_TYPE
    if target_stage == "design":
        return BUILDER_DESIGN_GENERATION_JOB_TYPE
    _raise_conflict("BUILDER_GENERATION_RESULT_INVALID")


def _dump(value: BaseSchema) -> JsonObject:
    return cast(JsonObject, value.model_dump(mode="json", by_alias=True))


def _generation_identity(*, workspace_id: UUID, project_id: UUID, idempotency_key: str) -> UUID:
    digest = sha256(f"arclayer:builder-generation:{workspace_id}:{project_id}:{idempotency_key}".encode()).digest()
    return UUID(bytes=digest[:16], version=4)


def _raise_not_found(code: str) -> NoReturn:
    raise NotFound(error=code, message=t("errors", code))


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))
