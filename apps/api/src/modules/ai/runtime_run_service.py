from __future__ import annotations

from datetime import UTC, datetime
from typing import NoReturn, cast
from uuid import UUID, uuid4

from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.core.events import events
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService, DomainEventPublisher
from src.llm.policy import (
    RuntimeAiPolicyResolver,
    require_concurrency_slot,
    resolve_runtime_policy,
)
from src.llm.runtime import LLMRuntimeError
from src.models.agents.runtime_v1 import AgentRunStatusV1, AgentRunV1Record, AgentThreadV1Record
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAuthorityMode,
    JobInternalStatus,
)
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextInputV1
from src.modules.ai.agent_builder_context_service import AgentBuilderContextError, AgentBuilderContextResolver
from src.modules.ai.agent_catalog_schema import ResolvedAgentAssignment
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextInputV1
from src.modules.ai.agent_design_system_context_service import (
    AgentDesignSystemContextError,
    AgentDesignSystemContextResolver,
)
from src.modules.ai.agent_knowledge_context_schema import AgentRunKnowledgeContextInputV1
from src.modules.ai.agent_skill_grant_schema import AgentRunSkillGrantSnapshotInput
from src.modules.ai.agent_skill_grant_service import (
    AgentSkillGrantError,
    AgentSkillGrantResolver,
    with_selected_lead_skill_installations,
)
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalResolvedDataV1,
    ApprovalResolvedEventV1,
    ApprovalV1,
)
from src.modules.ai.runtime_cancel_repository import (
    AgentRunCancellationRepository,
    AgentRunCancellationState,
)
from src.modules.ai.runtime_job_event_factory import terminal_settlement
from src.modules.ai.runtime_job_schema import (
    AGENT_RUN_JOB_TYPE,
    AGENT_RUN_JOB_TYPE_VERSION,
    AgentRunJobInput,
    AgentRunJobTarget,
)
from src.modules.ai.runtime_knowledge_context import (
    AgentKnowledgeContextError,
    AgentKnowledgeContextResolver,
)
from src.modules.ai.runtime_output_protocol_schema import RunCancelledDataV1, RunCancelledEventV1
from src.modules.ai.runtime_protocol_schema import (
    RunCancelRequestedDataV1,
    RunCancelRequestedEventV1,
    RunCreatedDataV1,
    RunCreatedEventV1,
    RunCreatedProjectionV1,
    RunQueuedDataV1,
    RunQueuedEventV1,
)
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand, PersistedAgentRunHead
from src.modules.ai.runtime_run_schema import AgentRunCreateRequestV1, AgentRunCreateResponseV1
from src.modules.ai.runtime_settlement_repository import (
    AgentRunSettlementProof,
    AgentRunSettlementRepository,
)
from src.modules.ai.runtime_snapshot_schema import AgentRunSnapshotV1
from src.modules.ai.runtime_stream_service import AgentRunStreamService
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService

_TERMINAL_JOB_STATUSES = frozenset({
    JobInternalStatus.SUCCEEDED,
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
})


class AgentRunService(BaseService):
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        runtime_repository: AgentRuntimeRepository | None = None,
        cancellation_repository: AgentRunCancellationRepository | None = None,
        settlement_repository: AgentRunSettlementRepository | None = None,
        stream_service: AgentRunStreamService | None = None,
        job_service: BackgroundJobService | None = None,
        catalog_service: AgentCatalogService | None = None,
        skill_grant_resolver: AgentSkillGrantResolver | None = None,
        knowledge_context_resolver: AgentKnowledgeContextResolver | None = None,
        design_system_context_resolver: AgentDesignSystemContextResolver | None = None,
        builder_context_resolver: AgentBuilderContextResolver | None = None,
        runtime_policy_resolver: RuntimeAiPolicyResolver = resolve_runtime_policy,
        event_publisher: DomainEventPublisher | None = events,
    ) -> None:
        super().__init__(settings, event_publisher=event_publisher, default_event_source="agent_run")
        self._runtime_repository = runtime_repository or AgentRuntimeRepository()
        self._cancellation_repository = cancellation_repository or AgentRunCancellationRepository()
        self._settlement_repository = settlement_repository or AgentRunSettlementRepository()
        self._stream_service = stream_service or AgentRunStreamService(self.settings)
        self._job_service = job_service or BackgroundJobService(self.settings)
        self._catalog_service = catalog_service or AgentCatalogService(self.settings)
        self._skill_grant_resolver = skill_grant_resolver
        self._knowledge_context_resolver = knowledge_context_resolver
        self._design_system_context_resolver = design_system_context_resolver
        self._builder_context_resolver = builder_context_resolver
        self._runtime_policy_resolver = runtime_policy_resolver

    async def create(
        self,
        *,
        workspace_id: UUID,
        thread_id: UUID,
        owner_user_id: UUID,
        idempotency_key: str,
        payload: AgentRunCreateRequestV1,
    ) -> AgentRunCreateResponseV1:
        normalized_key = idempotency_key.strip()
        request_hash = _run_request_hash(payload)
        job_result: BackgroundJobCreateResult | None = None
        await self._catalog_service.ensure_official_assignments(workspace_id=workspace_id)
        try:
            async with self.tx() as conn:
                await self._runtime_repository.lock_workspace_run_scope_in_transaction(
                    workspace_id=workspace_id,
                    conn=conn,
                )
                thread, existing = await self._runtime_repository.prepare_run_create_in_transaction(
                    workspace_id=workspace_id,
                    thread_id=thread_id,
                    owner_user_id=owner_user_id,
                    idempotency_key=normalized_key,
                    conn=conn,
                )
                if existing is not None:
                    head = await self._validate_create_replay(
                        existing=existing,
                        thread=thread,
                        payload=payload,
                        request_hash=request_hash,
                        conn=conn,
                    )
                else:
                    try:
                        require_concurrency_slot(
                            await self._runtime_policy_resolver(),
                            await self._runtime_repository.count_active_workspace_runs_in_transaction(
                                workspace_id=workspace_id,
                                conn=conn,
                            )
                            + 1,
                        )
                    except LLMRuntimeError as error:
                        raise AgentRuntimePersistenceError(error.code) from error
                    self._validate_thread_binding(thread=thread, payload=payload)
                    lead_agent, mentioned_agents = await self._catalog_service.resolve_run_agents(
                        workspace_id=workspace_id,
                        project_id=payload.project_id,
                        lead_agent_id=payload.lead_agent_id,
                        mentioned_agent_ids=payload.mentioned_agent_ids,
                        execution_mode=payload.execution_mode,
                        conn=conn,
                        ensure_catalog=False,
                    )
                    lead_agent = with_selected_lead_skill_installations(
                        workspace_id=workspace_id,
                        lead_agent=lead_agent,
                        selected_skill_installation_ids=payload.selected_skill_installation_ids,
                    )
                    skill_grants = await self._resolve_skill_grants(
                        workspace_id=workspace_id,
                        agents=(lead_agent, *mentioned_agents),
                        conn=conn,
                    )
                    knowledge_context = await self._resolve_knowledge_context(
                        workspace_id=workspace_id,
                        project_id=payload.project_id,
                        owner_user_id=owner_user_id,
                        agent_definition_id=lead_agent.agent_id,
                        conn=conn,
                    )
                    design_system_context = await self._resolve_design_system_context(
                        workspace_id=workspace_id,
                        project_id=payload.project_id,
                        conn=conn,
                    )
                    builder_context = await self._resolve_builder_context(
                        workspace_id=workspace_id,
                        project_id=payload.project_id,
                        site_revision_id=payload.site_revision_id,
                        design_system_context=design_system_context,
                        conn=conn,
                    )
                    head, job_result = await self._create_new_run(
                        workspace_id=workspace_id,
                        thread_id=thread_id,
                        owner_user_id=owner_user_id,
                        idempotency_key=normalized_key,
                        request_hash=request_hash,
                        payload=payload,
                        lead_agent=lead_agent,
                        mentioned_agents=mentioned_agents,
                        skill_grants=skill_grants,
                        knowledge_context=knowledge_context,
                        design_system_context=design_system_context,
                        builder_context=builder_context,
                        conn=conn,
                    )
        except (
            AgentRuntimePersistenceError,
            AgentSkillGrantError,
            AgentKnowledgeContextError,
            AgentDesignSystemContextError,
            AgentBuilderContextError,
        ) as error:
            self._raise_http(error)
        if job_result is not None:
            await self._job_service.publish_created_after_commit(job_result)
        return _run_create_response(workspace_id=workspace_id, head=head)

    async def _create_new_run(
        self,
        *,
        workspace_id: UUID,
        thread_id: UUID,
        owner_user_id: UUID,
        idempotency_key: str,
        request_hash: str,
        payload: AgentRunCreateRequestV1,
        lead_agent: ResolvedAgentAssignment,
        mentioned_agents: tuple[ResolvedAgentAssignment, ...],
        skill_grants: tuple[AgentRunSkillGrantSnapshotInput, ...],
        knowledge_context: AgentRunKnowledgeContextInputV1 | None,
        design_system_context: AgentRunDesignSystemContextInputV1 | None,
        builder_context: AgentRunBuilderContextInputV1 | None,
        conn: BaseDBAsyncClient,
    ) -> tuple[PersistedAgentRunHead, BackgroundJobCreateResult]:
        run_id = uuid4()
        occurred_at = datetime.now(UTC)
        correlation = correlation_id.get(None) or uuid4().hex
        job_result = await self._job_service.create_job_in_transaction(
            command=self._job_command(
                workspace_id=workspace_id,
                thread_id=thread_id,
                run_id=run_id,
                owner_user_id=owner_user_id,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                correlation=correlation,
                payload=payload,
            ),
            conn=conn,
        )
        head = await self._runtime_repository.create_run_with_first_event_in_transaction(
            command=AgentRunCreatePersistenceCommand(
                run_id=run_id,
                workspace_id=workspace_id,
                project_id=payload.project_id,
                thread_id=thread_id,
                job_id=job_result.job.id,
                owner_user_id=owner_user_id,
                lead_agent_id=lead_agent.agent_id,
                lead_agent_version_id=lead_agent.version_id,
                lead_agent_assignment_id=lead_agent.assignment_id,
                mentioned_agent_ids=tuple(item.agent_id for item in mentioned_agents),
                mentioned_agent_version_ids=tuple(item.version_id for item in mentioned_agents),
                mentioned_agent_assignment_ids=tuple(item.assignment_id for item in mentioned_agents),
                skill_grants=skill_grants,
                knowledge_context=knowledge_context,
                design_system_context=design_system_context,
                builder_context=builder_context,
                execution_mode=payload.execution_mode,
                site_revision_id=payload.site_revision_id,
                message=payload.message,
                idempotency_key=idempotency_key,
                correlation_id=correlation,
            ),
            event=_run_created_event(
                run_id=run_id,
                thread_id=thread_id,
                correlation=correlation,
                occurred_at=occurred_at,
                payload=payload,
            ),
            conn=conn,
        )
        status_value, last_sequence, last_cursor = await self._ensure_queued(
            run_id=run_id,
            thread_id=thread_id,
            correlation=correlation,
            occurred_at=occurred_at,
            head_status=head.status,
            head_sequence=head.last_sequence,
            head_cursor=head.last_cursor,
            conn=conn,
        )
        return (
            head.model_copy(
                update={
                    "status": status_value,
                    "last_sequence": last_sequence,
                    "last_cursor": last_cursor,
                }
            ),
            job_result,
        )

    async def _resolve_skill_grants(
        self,
        *,
        workspace_id: UUID,
        agents: tuple[ResolvedAgentAssignment, ...],
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentRunSkillGrantSnapshotInput, ...]:
        if not any(agent.skill_installation_ids for agent in agents):
            if any(agent.skill_grant_workspace_id is not None for agent in agents):
                raise AgentSkillGrantError("AGENT_SKILL_WORKSPACE_MISMATCH")
            return ()
        if self._skill_grant_resolver is None:
            raise AgentSkillGrantError("AGENT_SKILL_RESOLVER_UNAVAILABLE")
        return await self._skill_grant_resolver.resolve_run_grants(
            workspace_id=workspace_id,
            agents=agents,
            conn=conn,
        )

    async def _resolve_design_system_context(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> AgentRunDesignSystemContextInputV1 | None:
        if project_id is None:
            return None
        if self._design_system_context_resolver is None:
            raise AgentDesignSystemContextError("AGENT_DESIGN_SYSTEM_RESOLVER_UNAVAILABLE")
        return await self._design_system_context_resolver.resolve_run_context(
            workspace_id=workspace_id,
            project_id=project_id,
            conn=conn,
        )

    async def _resolve_knowledge_context(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        owner_user_id: UUID,
        agent_definition_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunKnowledgeContextInputV1 | None:
        if self._knowledge_context_resolver is None:
            raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_RESOLVER_UNAVAILABLE")
        return await self._knowledge_context_resolver.resolve_run_context(
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=owner_user_id,
            agent_definition_id=agent_definition_id,
            conn=conn,
        )

    async def _resolve_builder_context(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        site_revision_id: UUID | None,
        design_system_context: AgentRunDesignSystemContextInputV1 | None,
        conn: BaseDBAsyncClient,
    ) -> AgentRunBuilderContextInputV1 | None:
        if site_revision_id is None:
            return None
        if project_id is None:
            raise AgentBuilderContextError("AGENT_BUILDER_PROJECT_REQUIRED")
        if self._builder_context_resolver is None:
            raise AgentBuilderContextError("AGENT_BUILDER_CONTEXT_RESOLVER_UNAVAILABLE")
        resolved = await self._builder_context_resolver.resolve_run_context(
            workspace_id=workspace_id,
            project_id=project_id,
            site_revision_id=site_revision_id,
            conn=conn,
        )
        design = design_system_context.context if design_system_context is not None else None
        manifest = resolved.context.manifest
        if (
            design is None
            or design.design_system_id != manifest.design_system_id
            or design.version_id != manifest.design_system_version_id
            or design.manifest_checksum != manifest.design_system_manifest_checksum
        ):
            raise AgentBuilderContextError("AGENT_BUILDER_DESIGN_SYSTEM_CONTEXT_MISMATCH")
        return resolved

    def _job_command(
        self,
        *,
        workspace_id: UUID,
        thread_id: UUID,
        run_id: UUID,
        owner_user_id: UUID,
        idempotency_key: str,
        request_hash: str,
        correlation: str,
        payload: AgentRunCreateRequestV1,
    ) -> BackgroundJobCreate:
        definition = self._job_service.registry.require(
            job_type=AGENT_RUN_JOB_TYPE,
            job_type_version=AGENT_RUN_JOB_TYPE_VERSION,
        )
        return BackgroundJobCreate(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
            workspace_id=workspace_id,
            project_id=None,
            site_id=None,
            actor_user_id=owner_user_id,
            target_descriptor=_dump(AgentRunJobTarget(workspace_id=workspace_id)),
            input_reference=_dump(
                AgentRunJobInput(
                    run_id=run_id,
                    thread_id=thread_id,
                    project_id=payload.project_id,
                    request_hash=request_hash,
                )
            ),
            idempotency_key=f"agent-run:{thread_id}:{idempotency_key}",
            source_revision=str(payload.site_revision_id) if payload.site_revision_id is not None else None,
            correlation_id=correlation,
            trace_id=correlation,
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            status_key=definition.initial_status_key,
        )

    async def _validate_create_replay(
        self,
        *,
        existing: AgentRunV1Record,
        thread: AgentThreadV1Record,
        payload: AgentRunCreateRequestV1,
        request_hash: str,
        conn: BaseDBAsyncClient,
    ) -> PersistedAgentRunHead:
        job = None
        if existing.job_id is not None:
            job = await BackgroundJobRecord.filter(id=existing.job_id).using_db(conn).first()
        try:
            job_input = AgentRunJobInput.model_validate(job.input_reference) if job is not None else None
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT") from error
        if (
            job_input is None
            or job_input.request_hash != request_hash
            or job_input.run_id != existing.id
            or job_input.thread_id != thread.id
            or job_input.project_id != payload.project_id
            or existing.workspace_id != thread.workspace_id
            or existing.project_id != payload.project_id
            or existing.lead_agent_id != str(payload.lead_agent_id)
            or tuple(existing.mentioned_agent_ids) != tuple(str(value) for value in payload.mentioned_agent_ids)
            or existing.execution_mode != payload.execution_mode
            or existing.site_revision_id != payload.site_revision_id
        ):
            raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT")
        return self._runtime_repository.to_head(existing)

    @staticmethod
    def _validate_thread_binding(
        *,
        thread: AgentThreadV1Record,
        payload: AgentRunCreateRequestV1,
    ) -> None:
        if thread.project_id != payload.project_id or thread.lead_agent_id != str(payload.lead_agent_id):
            raise AgentRuntimePersistenceError("AGENT_THREAD_NOT_FOUND")

    async def cancel(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        run_id: UUID,
    ) -> AgentRunSnapshotV1:
        occurred_at = datetime.now(UTC)
        requested = False
        cancelled_job: BackgroundJobRecord | None = None
        try:
            async with self.tx() as conn:
                state = await self._cancellation_repository.get_owned_state_for_update(
                    workspace_id=workspace_id,
                    owner_user_id=owner_user_id,
                    run_id=run_id,
                    conn=conn,
                )
                if not state.terminal:
                    can_cancel_immediately = state.can_cancel_immediately
                    if state.job_id is None:
                        raise AgentRuntimePersistenceError("AGENT_RUN_JOB_SCOPE_INVALID")
                    next_sequence = state.last_sequence
                    if state.status != AgentRunStatusV1.CANCELLATION_REQUESTED:
                        next_sequence += 1
                        await self._runtime_repository.append_event_in_transaction(
                            event=_run_cancel_requested_event(
                                state=state,
                                sequence=next_sequence,
                                occurred_at=occurred_at,
                            ),
                            run_id=state.run_id,
                            conn=conn,
                        )
                    cancelled_job, requested = await self._job_service.request_cancellation_in_transaction(
                        job_id=state.job_id,
                        requested_by_user_id=owner_user_id,
                        reason="agent_run_user_requested",
                        requested_at=occurred_at,
                        conn=conn,
                    )
                    _validate_cancel_job_binding(state=state, job=cancelled_job)
                    terminal_job_is_compatible = can_cancel_immediately and (
                        cancelled_job.internal_status == JobInternalStatus.CANCELLED
                        or state.status == AgentRunStatusV1.INTERRUPTED
                    )
                    if cancelled_job.internal_status in _TERMINAL_JOB_STATUSES and not terminal_job_is_compatible:
                        raise AgentRuntimePersistenceError("AGENT_RUN_JOB_TERMINAL_CONFLICT")
                    if can_cancel_immediately:
                        if state.pending_approval is not None:
                            next_sequence += 1
                            await self._runtime_repository.append_event_in_transaction(
                                event=_approval_cancelled_event(
                                    state=state,
                                    approval=state.pending_approval,
                                    sequence=next_sequence,
                                    occurred_at=occurred_at,
                                ),
                                run_id=state.run_id,
                                conn=conn,
                            )
                        proof = await self._settlement_repository.get_terminal_proof_in_transaction(
                            run_id=state.run_id,
                            conn=conn,
                        )
                        await self._runtime_repository.append_event_in_transaction(
                            event=_run_cancelled_event(
                                state=state,
                                sequence=next_sequence + 1,
                                occurred_at=occurred_at,
                                proof=proof,
                            ),
                            run_id=state.run_id,
                            conn=conn,
                        )
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)
        if cancelled_job is not None:
            await self._job_service.publish_cancellation_requested_after_commit(
                job=cancelled_job,
                requested=requested,
            )
        return await self._stream_service.get_snapshot(
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            run_id=run_id,
        )

    async def _ensure_queued(
        self,
        *,
        run_id: UUID,
        thread_id: UUID,
        correlation: str,
        occurred_at: datetime,
        head_status: str,
        head_sequence: int,
        head_cursor: str,
        conn: BaseDBAsyncClient,
    ) -> tuple[str, int, str]:
        if head_sequence != 1:
            return head_status, head_sequence, head_cursor
        queued = await self._runtime_repository.append_event_in_transaction(
            event=RunQueuedEventV1(
                event_version=1,
                event_id=uuid4().hex,
                cursor=uuid4().hex,
                run_id=str(run_id),
                thread_id=str(thread_id),
                sequence=2,
                occurred_at=occurred_at,
                correlation_id=correlation,
                span_id=None,
                parent_span_id=None,
                type="run.queued",
                data=RunQueuedDataV1(
                    queued_at=occurred_at,
                    queue_class="agent-io",
                ),
            ),
            run_id=run_id,
            conn=conn,
        )
        return AgentRunStatusV1.QUEUED, queued.sequence, queued.cursor

    @staticmethod
    def _raise_http(
        error: (
            AgentRuntimePersistenceError
            | AgentSkillGrantError
            | AgentKnowledgeContextError
            | AgentDesignSystemContextError
            | AgentBuilderContextError
        ),
    ) -> NoReturn:
        if error.code in {"AGENT_RUN_NOT_FOUND", "AGENT_THREAD_NOT_FOUND"}:
            raise NotFound(error=error.code, message=t("errors", error.code)) from error
        if error.code in {"AGENT_RUN_IDEMPOTENCY_CONFLICT", "POLICY_CONCURRENCY_LIMIT_EXCEEDED"}:
            raise Conflict(error=error.code, message=t("errors", error.code)) from error
        if isinstance(
            error,
            (
                AgentSkillGrantError,
                AgentKnowledgeContextError,
                AgentDesignSystemContextError,
                AgentBuilderContextError,
            ),
        ):
            raise Conflict(error=error.code, message=t("errors", error.code)) from error
        raise error


def _run_created_event(
    *,
    run_id: UUID,
    thread_id: UUID,
    correlation: str,
    occurred_at: datetime,
    payload: AgentRunCreateRequestV1,
) -> RunCreatedEventV1:
    return RunCreatedEventV1(
        event_version=1,
        event_id=uuid4().hex,
        cursor=uuid4().hex,
        run_id=str(run_id),
        thread_id=str(thread_id),
        sequence=1,
        occurred_at=occurred_at,
        correlation_id=correlation,
        span_id=None,
        parent_span_id=None,
        type="run.created",
        data=RunCreatedDataV1(
            run=RunCreatedProjectionV1(
                status="created",
                execution_mode=payload.execution_mode,
                lead_agent_id=str(payload.lead_agent_id),
                created_at=occurred_at,
            )
        ),
    )


def _run_request_hash(payload: AgentRunCreateRequestV1) -> str:
    return hash_json(cast(JsonObject, payload.model_dump(by_alias=True, mode="json")))


def _run_create_response(
    *,
    workspace_id: UUID,
    head: PersistedAgentRunHead,
) -> AgentRunCreateResponseV1:
    encoded_workspace = encode_uuid(workspace_id)
    encoded_run = encode_uuid(head.run_id)
    base_url = f"/api/v1/workspaces/{encoded_workspace}/ai/runs/{encoded_run}"
    return AgentRunCreateResponseV1(
        run_id=head.run_id,
        thread_id=head.thread_id,
        status=AgentRunStatusV1(head.status),
        snapshot_url=base_url,
        events_url=f"{base_url}/events",
        last_sequence=head.last_sequence,
        last_cursor=head.last_cursor,
    )


def _dump(value: BaseSchema) -> JsonObject:
    return cast(JsonObject, value.model_dump(by_alias=True, mode="json"))


def _run_cancel_requested_event(
    *,
    state: AgentRunCancellationState,
    sequence: int,
    occurred_at: datetime,
) -> RunCancelRequestedEventV1:
    return RunCancelRequestedEventV1(
        event_version=1,
        event_id=uuid4().hex,
        cursor=uuid4().hex,
        run_id=str(state.run_id),
        thread_id=str(state.thread_id),
        sequence=sequence,
        occurred_at=occurred_at,
        correlation_id=state.correlation_id,
        span_id=None,
        parent_span_id=None,
        type="run.cancel.requested",
        data=RunCancelRequestedDataV1(
            requested_at=occurred_at,
            requested_by_actor_id=str(state.owner_user_id),
        ),
    )


def _run_cancelled_event(
    *,
    state: AgentRunCancellationState,
    sequence: int,
    occurred_at: datetime,
    proof: AgentRunSettlementProof,
) -> RunCancelledEventV1:
    incomplete_part_ids = tuple(
        part_id for part_id in state.running_part_ids if part_id != state.pending_approval_part_id
    )
    return RunCancelledEventV1(
        event_version=1,
        event_id=uuid4().hex,
        cursor=uuid4().hex,
        run_id=str(state.run_id),
        thread_id=str(state.thread_id),
        sequence=sequence,
        occurred_at=occurred_at,
        correlation_id=state.correlation_id,
        span_id=None,
        parent_span_id=None,
        type="run.cancelled",
        data=RunCancelledDataV1(
            cancelled_at=occurred_at,
            reason_code="USER_REQUESTED",
            incomplete_part_ids=incomplete_part_ids,
            settlement=terminal_settlement(proof=proof),
        ),
    )


def _approval_cancelled_event(
    *,
    state: AgentRunCancellationState,
    approval: ApprovalV1,
    sequence: int,
    occurred_at: datetime,
) -> ApprovalResolvedEventV1:
    return ApprovalResolvedEventV1(
        event_version=1,
        event_id=uuid4().hex,
        cursor=uuid4().hex,
        run_id=str(state.run_id),
        thread_id=str(state.thread_id),
        sequence=sequence,
        occurred_at=occurred_at,
        correlation_id=state.correlation_id,
        span_id=f"run-cancel:{uuid4().hex}",
        parent_span_id=f"approval:{approval.tool_call_id}",
        type="approval.resolved",
        data=ApprovalResolvedDataV1(
            approval=approval.model_copy(update={"status": "cancelled"}),
            resolved_at=occurred_at,
            resolved_by_actor_id=str(state.owner_user_id),
        ),
    )


def _validate_cancel_job_binding(
    *,
    state: AgentRunCancellationState,
    job: BackgroundJobRecord,
) -> None:
    if (
        job.id != state.job_id
        or job.workspace_id != state.workspace_id
        or job.actor_user_id != state.owner_user_id
        or job.job_type != AGENT_RUN_JOB_TYPE
        or job.job_type_version != AGENT_RUN_JOB_TYPE_VERSION
    ):
        raise AgentRuntimePersistenceError("AGENT_RUN_JOB_SCOPE_INVALID")
