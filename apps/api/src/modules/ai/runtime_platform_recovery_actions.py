from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from hashlib import sha256
from typing import Literal, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict
from src.core.services import BaseService
from src.llm.policy import RuntimeAiPolicyResolver, require_retry_allowed, resolve_runtime_policy
from src.llm.runtime import LLMRuntimeError
from src.models.agents.runtime_recovery_v1 import (
    AgentRunExecutionEffectDisposition,
    AgentRunExecutionEffectRecord,
    AgentRunRecoveryAction,
    AgentRunRecoveryRecord,
)
from src.models.agents.runtime_v1 import AgentRunStatusV1, AgentRunV1Record
from src.models.jobs.background_job import BackgroundJobRecord, JobFailureClassification, JobInternalStatus
from src.modules.ai.runtime_job_schema import AGENT_RUN_JOB_TYPE, AGENT_RUN_JOB_TYPE_VERSION
from src.modules.ai.runtime_platform_recovery_schema import PlatformAIRecoveryCommand, PlatformAIRecoveryReceipt
from src.modules.ai.runtime_recovery_protocol_schema import (
    RunRecoveryRequestedDataV1,
    RunRecoveryRequestedEventV1,
)
from src.modules.ai.runtime_recovery_repository import (
    AgentRunExecutionEffectRepository,
    AgentRunRecoveryRepository,
)
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.actor_authorizer import WorkspaceActorJobAuthorizer
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService

_FAILED_JOB_STATUSES = frozenset({JobInternalStatus.FAILED, JobInternalStatus.DEAD_LETTERED})
_RETRYABLE_FAILURES = frozenset({JobFailureClassification.TRANSIENT, JobFailureClassification.WORKER_LOST})

ActivityAuditWriter = Callable[..., Awaitable[object]]


class AgentRunPlatformRecoveryActionPort(BaseService):
    """Create one durable recovery generation without reopening its source Job."""

    def __init__(
        self,
        settings: Settings,
        *,
        action: Literal["retry", "reconcile"],
        recoveries: AgentRunRecoveryRepository | None = None,
        effects: AgentRunExecutionEffectRepository | None = None,
        runtime: AgentRuntimeRepository | None = None,
        jobs: BackgroundJobService | None = None,
        actor_authorizer: WorkspaceActorJobAuthorizer | None = None,
        activity_audit_writer: ActivityAuditWriter = write_required_activity_event,
        runtime_policy_resolver: RuntimeAiPolicyResolver = resolve_runtime_policy,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="platform.ai.recovery")
        self._action = AgentRunRecoveryAction(action)
        self._recoveries = recoveries or AgentRunRecoveryRepository()
        self._effects = effects or AgentRunExecutionEffectRepository()
        self._runtime = runtime or AgentRuntimeRepository()
        self._jobs = jobs or BackgroundJobService(settings)
        self._actor_authorizer = actor_authorizer or WorkspaceActorJobAuthorizer()
        self._activity_audit_writer = activity_audit_writer
        self._runtime_policy_resolver = runtime_policy_resolver

    async def __call__(self, *, command: PlatformAIRecoveryCommand) -> PlatformAIRecoveryReceipt:
        if command.action != self._action:
            raise ValueError(f"Platform {self._action} port received {command.action}")
        job_result: BackgroundJobCreateResult | None = None
        async with self.tx() as conn:
            run = await self._locked_run(run_id=command.task_id, conn=conn)
            replay = await self._replay(command=command, run=run, conn=conn)
            if replay is not None:
                return _receipt(recovery=replay, workspace_id=run.workspace_id, disposition="already_applied")
            source_job = await self._locked_source_job(run=run, conn=conn)
            effect = await self._effects.latest_for_job_for_update(job_id=source_job.id, conn=conn)
            await self._validate_eligibility(run=run, source_job=source_job, effect=effect, conn=conn)
            await self._revalidate_actor(source_job=source_job)
            accepted_at = datetime.now(UTC)
            recovery = await self._create_recovery(
                command=command,
                run=run,
                source_job=source_job,
                accepted_at=accepted_at,
                conn=conn,
            )
            job_result = await self._jobs.create_job_in_transaction(
                command=self._job_command(
                    command=command,
                    source_job=source_job,
                    recovery=recovery,
                ),
                conn=conn,
            )
            if not job_result.created or job_result.job.id == source_job.id:
                raise AgentRuntimePersistenceError("AGENT_RUN_RECOVERY_JOB_IDENTITY_INVALID")
            await self._recoveries.bind_recovery_job(recovery=recovery, job=job_result.job, conn=conn)
            await self._runtime.append_event_in_transaction(
                event=_recovery_event(
                    command=command,
                    run=run,
                    recovery=recovery,
                    recovery_job=job_result.job,
                    occurred_at=accepted_at,
                ),
                run_id=run.id,
                conn=conn,
            )
            await self._write_audit(
                command=command,
                run=run,
                source_job=source_job,
                recovery=recovery,
                recovery_job=job_result.job,
                effect=effect,
                conn=conn,
            )
        if job_result is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_RECOVERY_JOB_MISSING")
        await self._jobs.publish_created_after_commit(job_result)
        return _receipt(recovery=recovery, workspace_id=run.workspace_id, disposition="accepted")

    async def _replay(
        self,
        *,
        command: PlatformAIRecoveryCommand,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient,
    ) -> AgentRunRecoveryRecord | None:
        recovery = await self._recoveries.get_by_idempotency_hash_for_update(
            idempotency_key_hash=_idempotency_hash(command),
            conn=conn,
        )
        if recovery is None:
            return None
        if (
            recovery.run_id != run.id
            or recovery.action != self._action
            or recovery.request_fingerprint != _request_fingerprint(command)
            or recovery.recovery_job_id is None
        ):
            raise Conflict(error="AI_PLATFORM_TASK_IDEMPOTENCY_CONFLICT")
        return recovery

    async def _validate_eligibility(
        self,
        *,
        run: AgentRunV1Record,
        source_job: BackgroundJobRecord,
        effect: AgentRunExecutionEffectRecord | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        if self._action == AgentRunRecoveryAction.RETRY:
            await self._validate_retry(run=run, source_job=source_job, effect=effect, conn=conn)
            return
        if run.status not in {AgentRunStatusV1.COMPLETED, AgentRunStatusV1.CANCELLED, AgentRunStatusV1.FAILED}:
            raise Conflict(error="AI_PLATFORM_TASK_RECONCILE_NOT_ELIGIBLE")
        if effect is None or effect.disposition != AgentRunExecutionEffectDisposition.COMMITTED:
            raise Conflict(error="AI_PLATFORM_TASK_RECONCILE_SOURCE_UNAVAILABLE")

    async def _validate_retry(
        self,
        *,
        run: AgentRunV1Record,
        source_job: BackgroundJobRecord,
        effect: AgentRunExecutionEffectRecord | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        if run.status != AgentRunStatusV1.FAILED or source_job.internal_status not in _FAILED_JOB_STATUSES:
            raise Conflict(error="AI_PLATFORM_TASK_RETRY_NOT_ELIGIBLE")
        if effect is not None:
            raise Conflict(error="AI_PLATFORM_TASK_RETRY_EFFECT_ALREADY_CROSSED")
        attempt = await self._recoveries.latest_attempt_for_job_for_update(job_id=source_job.id, conn=conn)
        if attempt is None or attempt.failure_classification not in _RETRYABLE_FAILURES:
            raise Conflict(error="AI_PLATFORM_TASK_RETRY_PERMANENT_FAILURE")
        try:
            require_retry_allowed(await self._runtime_policy_resolver(), attempt.attempt_number + 1)
        except LLMRuntimeError as error:
            raise Conflict(error="AI_PLATFORM_TASK_RETRY_POLICY_BLOCKED") from error

    async def _revalidate_actor(self, *, source_job: BackgroundJobRecord) -> None:
        definition = self._jobs.registry.require(
            job_type=source_job.job_type,
            job_type_version=source_job.job_type_version,
        )
        actor_user_id = source_job.actor_user_id
        requirement = definition.required_permission
        if actor_user_id is None or requirement is None or source_job.workspace_id is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_RECOVERY_JOB_SCOPE_INVALID")
        try:
            await self._actor_authorizer.authorize(
                workspace_id=source_job.workspace_id,
                project_id=source_job.project_id,
                actor_user_id=actor_user_id,
                requirement=requirement,
            )
        except PermanentJobExecutionError as error:
            raise Conflict(error="AI_PLATFORM_TASK_ORIGINAL_ACTOR_NO_LONGER_AUTHORIZED") from error

    async def _create_recovery(
        self,
        *,
        command: PlatformAIRecoveryCommand,
        run: AgentRunV1Record,
        source_job: BackgroundJobRecord,
        accepted_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> AgentRunRecoveryRecord:
        generation = await self._recoveries.next_generation(run_id=run.id, conn=conn)
        return await self._recoveries.create_recovery(
            run=run,
            source_job=source_job,
            action=self._action,
            generation=generation,
            actor_user_id=command.authority.actor_user_id,
            idempotency_key_hash=_idempotency_hash(command),
            request_fingerprint=_request_fingerprint(command),
            correlation_id=command.authority.correlation_id,
            reason=command.reason,
            accepted_at=accepted_at,
            conn=conn,
        )

    def _job_command(
        self,
        *,
        command: PlatformAIRecoveryCommand,
        source_job: BackgroundJobRecord,
        recovery: AgentRunRecoveryRecord,
    ) -> BackgroundJobCreate:
        definition = self._jobs.registry.require(
            job_type=source_job.job_type,
            job_type_version=source_job.job_type_version,
        )
        return BackgroundJobCreate(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            authority_mode=definition.authority_mode,
            workspace_id=source_job.workspace_id,
            project_id=source_job.project_id,
            site_id=source_job.site_id,
            actor_user_id=source_job.actor_user_id,
            target_descriptor=cast(JsonObject, source_job.target_descriptor),
            input_reference=cast(JsonObject, source_job.input_reference),
            idempotency_key=f"platform-ai-recovery:{recovery.id}",
            source_revision=source_job.source_revision,
            correlation_id=str(command.authority.correlation_id),
            trace_id=str(command.authority.correlation_id),
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            retry_of_job_id=source_job.id,
            status_key=definition.initial_status_key,
        )

    async def _write_audit(
        self,
        *,
        command: PlatformAIRecoveryCommand,
        run: AgentRunV1Record,
        source_job: BackgroundJobRecord,
        recovery: AgentRunRecoveryRecord,
        recovery_job: BackgroundJobRecord,
        effect: AgentRunExecutionEffectRecord | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_audit_writer(
            settings=self.settings,
            conn=conn,
            payload=ActivityAuditPayload(
                event_name=f"platform.ai_task.{self._action}_accepted",
                actor_user_id=command.authority.actor_user_id,
                workspace_id=run.workspace_id,
                entity_type="agent_run_recovery",
                entity_id=recovery.id,
                source="platform",
                trace_id=str(command.authority.correlation_id),
                properties={
                    "action": str(self._action),
                    "run_id": str(run.id),
                    "source_job_id": str(source_job.id),
                    "recovery_job_id": str(recovery_job.id),
                    "source_effect_id": str(effect.id) if effect is not None else None,
                    "source_effect_disposition": str(effect.disposition) if effect is not None else None,
                },
            ),
        )

    async def _locked_run(
        self,
        *,
        run_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunV1Record:
        run = await self._recoveries.get_run_for_update(run_id=run_id, conn=conn)
        if run is None:
            raise Conflict(error="AI_PLATFORM_TASK_NOT_FOUND")
        return run

    async def _locked_source_job(
        self,
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobRecord:
        if run.job_id is None:
            raise Conflict(error=f"AI_PLATFORM_TASK_{str(self._action).upper()}_NOT_ELIGIBLE")
        job = await self._recoveries.get_job_for_update(job_id=run.job_id, conn=conn)
        if (
            job is None
            or job.job_type != AGENT_RUN_JOB_TYPE
            or job.job_type_version != AGENT_RUN_JOB_TYPE_VERSION
            or job.workspace_id != run.workspace_id
            or job.actor_user_id != run.owner_user_id
        ):
            raise AgentRuntimePersistenceError("AGENT_RUN_RECOVERY_JOB_SCOPE_INVALID")
        return job


def _recovery_event(
    *,
    command: PlatformAIRecoveryCommand,
    run: AgentRunV1Record,
    recovery: AgentRunRecoveryRecord,
    recovery_job: BackgroundJobRecord,
    occurred_at: datetime,
) -> RunRecoveryRequestedEventV1:
    return RunRecoveryRequestedEventV1(
        event_version=1,
        event_id=f"platform-recovery:{recovery.id}",
        cursor=f"platform-recovery-cursor:{recovery.id}",
        run_id=str(run.id),
        thread_id=str(run.thread_id),
        sequence=run.last_sequence + 1,
        occurred_at=occurred_at,
        correlation_id=run.correlation_id,
        span_id=f"platform-recovery:{command.authority.correlation_id}",
        parent_span_id=None,
        type="run.recovery.requested",
        data=RunRecoveryRequestedDataV1(
            recovery_id=str(recovery.id),
            action=cast(Literal["retry", "reconcile"], str(recovery.action)),
            source_job_id=str(recovery.source_job_id),
            recovery_job_id=str(recovery_job.id),
            requested_at=occurred_at,
        ),
    )


def _receipt(
    *,
    recovery: AgentRunRecoveryRecord,
    workspace_id: UUID,
    disposition: Literal["accepted", "already_applied"],
) -> PlatformAIRecoveryReceipt:
    if recovery.recovery_job_id is None:
        raise AgentRuntimePersistenceError("AGENT_RUN_RECOVERY_JOB_MISSING")
    return PlatformAIRecoveryReceipt(
        task_id=recovery.run_id,
        action=cast(Literal["retry", "reconcile"], str(recovery.action)),
        disposition=disposition,
        workspace_id=workspace_id,
        job_id=recovery.recovery_job_id,
        recovery_id=recovery.id,
        source_job_id=recovery.source_job_id,
    )


def _idempotency_hash(command: PlatformAIRecoveryCommand) -> str:
    return sha256(f"{command.task_id}:{command.action}:{command.idempotency_key}".encode()).hexdigest()


def _request_fingerprint(command: PlatformAIRecoveryCommand) -> str:
    return sha256(
        (
            f"{command.task_id}:{command.action}:{command.authority.actor_user_id}:"
            f"{command.idempotency_key}:{command.reason or ''}"
        ).encode()
    ).hexdigest()
