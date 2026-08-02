from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from hashlib import sha256
from typing import Literal, Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict
from src.core.services import BaseService
from src.models.agents.runtime_v1 import AgentRunEventV1Record, AgentRunStatusV1
from src.models.jobs.background_job import BackgroundJobRecord, JobInternalStatus
from src.modules.ai.runtime_cancel_repository import AgentRunCancellationRepository, AgentRunCancellationState
from src.modules.ai.runtime_job_event_factory import terminal_settlement
from src.modules.ai.runtime_output_protocol_schema import RunCancelledDataV1, RunCancelledEventV1
from src.modules.ai.runtime_platform_recovery_actions import AgentRunPlatformRecoveryActionPort
from src.modules.ai.runtime_platform_recovery_schema import (
    PlatformAIRecoveryAction,
    PlatformAIRecoveryCommand,
    PlatformAIRecoveryReceipt,
)
from src.modules.ai.runtime_protocol_schema import RunCancelRequestedDataV1, RunCancelRequestedEventV1
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_settlement_repository import AgentRunSettlementProof, AgentRunSettlementRepository
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.service import BackgroundJobService

_TERMINAL_JOB_STATUSES = frozenset({
    JobInternalStatus.SUCCEEDED,
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
})

ActivityAuditWriter = Callable[..., Awaitable[object]]
PlatformCancellationReplayReader = Callable[..., Awaitable[RunCancelRequestedEventV1 | None]]


class PlatformAIRecoveryActionPort(Protocol):
    async def __call__(self, *, command: PlatformAIRecoveryCommand) -> PlatformAIRecoveryReceipt: ...


class PlatformAIRetryPort(PlatformAIRecoveryActionPort, Protocol):
    """Retry only a failed Run/Job under its original idempotency, metering, and effect contract.

    Implementations must lock and re-read the durable Run and Job, reject every
    state other than a failed Run with a failed/dead-lettered Job, and return an
    existing receipt for an idempotent replay. They must not recreate a Run,
    mint a replacement idempotency identity, or replay a settled provider effect.
    The accepted command and its Platform actor must be written to durable Audit
    evidence in the same transaction as the owned retry transition.
    """


class PlatformAIReconciliationPort(PlatformAIRecoveryActionPort, Protocol):
    """Reconcile only a durable partial or unknown terminal outcome.

    Implementations must return source-backed effect, metering, and verification
    evidence in their receipt contract. They must not infer success from a closed
    stream or write Run/Job status fields outside the owning state machines.
    The accepted command and its Platform actor must be written to durable Audit
    evidence in the same transaction as the reconciliation transition.
    """


class AgentRunPlatformCancellationPort(BaseService):
    """Canonical Platform cancellation command over the AI Run and Job state machines."""

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        cancellation_repository: AgentRunCancellationRepository | None = None,
        runtime_repository: AgentRuntimeRepository | None = None,
        settlement_repository: AgentRunSettlementRepository | None = None,
        job_service: BackgroundJobService | None = None,
        activity_audit_writer: ActivityAuditWriter = write_required_activity_event,
        replay_reader: PlatformCancellationReplayReader | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="platform.ai.recovery")
        self._cancellation_repository = cancellation_repository or AgentRunCancellationRepository()
        self._runtime_repository = runtime_repository or AgentRuntimeRepository()
        self._settlement_repository = settlement_repository or AgentRunSettlementRepository()
        self._job_service = job_service or BackgroundJobService(self.settings)
        self._activity_audit_writer = activity_audit_writer
        self._replay_reader = replay_reader or _load_cancellation_replay

    async def __call__(self, *, command: PlatformAIRecoveryCommand) -> PlatformAIRecoveryReceipt:
        if command.action != "cancel":
            raise ValueError("Platform cancellation port only accepts cancel commands")
        requested = False
        run_transition_requested = False
        job: BackgroundJobRecord | None = None
        async with self.tx() as conn:
            state = await self._cancellation_repository.get_platform_state_for_update(run_id=command.task_id, conn=conn)
            replay = await self._replay_reader(event_id=_cancellation_event_id(command=command), conn=conn)
            if replay is not None:
                _validate_cancellation_replay(command=command, state=state, event=replay)
                return _receipt(command=command, state=state, disposition="already_applied")
            self._reject_workspace_interaction(state=state)
            job, requested, run_transition_requested = await self._request_cancellation(
                command=command,
                state=state,
                conn=conn,
            )
            if requested or run_transition_requested:
                await self._write_audit(command=command, state=state, conn=conn)
        if job is not None:
            await self._job_service.publish_cancellation_requested_after_commit(job=job, requested=requested)
        return _receipt(
            command=command,
            state=state,
            disposition="accepted" if requested or run_transition_requested else "already_applied",
        )

    async def _request_cancellation(
        self,
        *,
        command: PlatformAIRecoveryCommand,
        state: AgentRunCancellationState,
        conn: BaseDBAsyncClient,
    ) -> tuple[BackgroundJobRecord, bool, bool]:
        if state.job_id is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_JOB_SCOPE_INVALID")
        occurred_at = datetime.now(UTC)
        next_sequence = state.last_sequence
        run_transition_requested = state.status != AgentRunStatusV1.CANCELLATION_REQUESTED
        if run_transition_requested:
            next_sequence += 1
            await self._runtime_repository.append_event_in_transaction(
                event=_cancel_requested_event(
                    state=state,
                    sequence=next_sequence,
                    occurred_at=occurred_at,
                    actor_user_id=command.authority.actor_user_id,
                    idempotency_key=command.idempotency_key,
                    reason=command.reason,
                ),
                run_id=state.run_id,
                conn=conn,
            )
        job, requested = await self._job_service.request_cancellation_in_transaction(
            job_id=state.job_id,
            requested_by_user_id=command.authority.actor_user_id,
            reason="agent_run_platform_requested",
            requested_at=occurred_at,
            conn=conn,
        )
        _validate_job_binding(state=state, job=job)
        if job.internal_status in _TERMINAL_JOB_STATUSES and not state.can_cancel_immediately:
            raise AgentRuntimePersistenceError("AGENT_RUN_JOB_TERMINAL_CONFLICT")
        if state.can_cancel_immediately and requested:
            proof = await self._settlement_repository.get_terminal_proof_in_transaction(run_id=state.run_id, conn=conn)
            await self._runtime_repository.append_event_in_transaction(
                event=_cancelled_event(state=state, sequence=next_sequence + 1, occurred_at=occurred_at, proof=proof),
                run_id=state.run_id,
                conn=conn,
            )
        return job, requested, run_transition_requested

    async def _write_audit(
        self,
        *,
        command: PlatformAIRecoveryCommand,
        state: AgentRunCancellationState,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_audit_writer(
            settings=self.settings,
            conn=conn,
            payload=ActivityAuditPayload(
                event_name="platform.ai_task.cancellation_requested",
                actor_user_id=command.authority.actor_user_id,
                workspace_id=state.workspace_id,
                entity_type="agent_run",
                entity_id=state.run_id,
                source="platform",
                trace_id=str(command.authority.correlation_id),
                properties={
                    "authority": command.authority.kind,
                    "idempotency_key": command.idempotency_key,
                    "reason": command.reason,
                    "job_id": str(state.job_id) if state.job_id is not None else None,
                },
            ),
        )

    @staticmethod
    def _reject_workspace_interaction(*, state: AgentRunCancellationState) -> None:
        if state.pending_approval is not None:
            raise Conflict(error="AI_PLATFORM_TASK_WORKSPACE_APPROVAL_NON_AUTHORITY")
        if state.status == AgentRunStatusV1.INTERRUPTED:
            raise Conflict(error="AI_PLATFORM_TASK_WORKSPACE_INTERACTION_NON_AUTHORITY")
        if state.status == AgentRunStatusV1.CANCELLATION_REQUESTED:
            raise Conflict(error="AI_PLATFORM_TASK_CANCELLATION_ALREADY_REQUESTED")
        if state.terminal:
            raise Conflict(error="AI_PLATFORM_TASK_CANCEL_NOT_ELIGIBLE")


class AgentRunPlatformRecoveryPort(BaseService):
    """Inject only recovery protocols that preserve the original Run/Job effect boundary."""

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        cancellation_port: PlatformAIRecoveryActionPort | None = None,
        retry_port: PlatformAIRetryPort | None = None,
        reconciliation_port: PlatformAIReconciliationPort | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="platform.ai.recovery")
        self._cancellation_port = cancellation_port or AgentRunPlatformCancellationPort(self.settings)
        self._retry_port = retry_port or AgentRunPlatformRecoveryActionPort(self.settings, action="retry")
        self._reconciliation_port = reconciliation_port or AgentRunPlatformRecoveryActionPort(
            self.settings,
            action="reconcile",
        )

    async def execute(self, *, command: PlatformAIRecoveryCommand) -> PlatformAIRecoveryReceipt:
        port = self._port_for(action=command.action)
        return await port(command=command)

    def _port_for(self, *, action: PlatformAIRecoveryAction) -> PlatformAIRecoveryActionPort:
        if action == "cancel":
            return self._cancellation_port
        if action == "retry":
            return self._retry_port
        if action == "reconcile":
            return self._reconciliation_port
        raise ValueError(f"Unsupported Platform AI recovery action: {action}")


def _receipt(
    *,
    command: PlatformAIRecoveryCommand,
    state: AgentRunCancellationState,
    disposition: Literal["accepted", "already_applied"],
) -> PlatformAIRecoveryReceipt:
    return PlatformAIRecoveryReceipt(
        task_id=state.run_id,
        action=command.action,
        disposition=disposition,
        workspace_id=state.workspace_id,
        job_id=state.job_id,
    )


def _cancel_requested_event(
    *,
    state: AgentRunCancellationState,
    sequence: int,
    occurred_at: datetime,
    actor_user_id: UUID,
    idempotency_key: str,
    reason: str | None,
) -> RunCancelRequestedEventV1:
    command_digest = sha256(f"platform-cancel:{state.run_id}:{idempotency_key}".encode()).hexdigest()
    request_fingerprint = sha256(
        f"{state.run_id}:cancel:{actor_user_id}:{idempotency_key}:{reason or ''}".encode()
    ).hexdigest()
    return RunCancelRequestedEventV1(
        event_version=1,
        event_id=f"platform-cancel:{command_digest}",
        cursor=f"platform-cancel-cursor:{command_digest}",
        run_id=str(state.run_id),
        thread_id=str(state.thread_id),
        sequence=sequence,
        occurred_at=occurred_at,
        correlation_id=state.correlation_id,
        span_id=f"platform-cancel-request:{request_fingerprint}",
        parent_span_id=None,
        type="run.cancel.requested",
        data=RunCancelRequestedDataV1(requested_at=occurred_at, requested_by_actor_id=str(actor_user_id)),
    )


def _cancelled_event(
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
        event_id=f"platform-cancelled:{state.run_id}:{sequence}",
        cursor=f"platform-cancelled:{state.run_id}:{sequence}",
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
            reason_code="PLATFORM_OPERATOR_REQUESTED",
            incomplete_part_ids=incomplete_part_ids,
            settlement=terminal_settlement(proof=proof),
        ),
    )


def _validate_job_binding(*, state: AgentRunCancellationState, job: BackgroundJobRecord) -> None:
    if job.id != state.job_id or job.workspace_id != state.workspace_id or job.actor_user_id != state.owner_user_id:
        raise AgentRuntimePersistenceError("AGENT_RUN_JOB_SCOPE_INVALID")


async def _load_cancellation_replay(
    *,
    event_id: str,
    conn: BaseDBAsyncClient,
) -> RunCancelRequestedEventV1 | None:
    record = await AgentRunEventV1Record.filter(event_id=event_id).using_db(conn).select_for_update().first()
    return RunCancelRequestedEventV1.model_validate(record.payload) if record is not None else None


def _cancellation_event_id(*, command: PlatformAIRecoveryCommand) -> str:
    digest = sha256(f"platform-cancel:{command.task_id}:{command.idempotency_key}".encode()).hexdigest()
    return f"platform-cancel:{digest}"


def _validate_cancellation_replay(
    *,
    command: PlatformAIRecoveryCommand,
    state: AgentRunCancellationState,
    event: RunCancelRequestedEventV1,
) -> None:
    request_fingerprint = sha256(
        f"{state.run_id}:cancel:{command.authority.actor_user_id}:{command.idempotency_key}:{command.reason or ''}".encode()
    ).hexdigest()
    if (
        event.run_id != str(state.run_id)
        or event.data.requested_by_actor_id != str(command.authority.actor_user_id)
        or event.span_id != f"platform-cancel-request:{request_fingerprint}"
    ):
        raise Conflict(error="AI_PLATFORM_TASK_IDEMPOTENCY_CONFLICT")
