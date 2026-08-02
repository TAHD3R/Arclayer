from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.services import BaseService
from src.models.agents.runtime_recovery_v1 import (
    AgentRunExecutionEffectDisposition,
    AgentRunExecutionEffectRecord,
)
from src.models.agents.runtime_v1 import AgentRunV1Record
from src.models.jobs.background_job import BackgroundJobRecord, JobAttemptRecord
from src.modules.ai.runtime_recovery_repository import AgentRunExecutionEffectRepository
from src.modules.ai.runtime_recovery_schema import (
    AgentRunExecutionEffectRegistration,
    AgentRunExecutionEffectSnapshot,
)
from src.modules.jobs.execution_errors import (
    JobExecutionCancellationRequestedError,
    JobExecutionStateInvariantError,
)
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.execution_schema import JobExecutionControlSnapshot, JobExecutionLease
from src.modules.jobs.execution_validation import build_execution_control_snapshot
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.repository import BackgroundJobRepository


class AgentRunExecutionEffectService(BaseService):
    """Fence the Agent execution boundary and retain the exact returned outcome."""

    def __init__(
        self,
        settings: Settings,
        *,
        jobs: JobExecutionRepository | None = None,
        effects: AgentRunExecutionEffectRepository | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="agent-run-effect")
        self._jobs = jobs or BackgroundJobRepository()
        self._effects = effects or AgentRunExecutionEffectRepository()

    async def register(
        self,
        *,
        lease: JobExecutionLease,
        registration: AgentRunExecutionEffectRegistration,
    ) -> AgentRunExecutionEffectSnapshot:
        async with self.tx() as conn:
            job, attempt, run, control = await self._locked_execution(
                lease=lease,
                run_id=registration.run_id,
                conn=conn,
            )
            if control.cancellation_requested:
                raise JobExecutionCancellationRequestedError(control=control)
            effect = await self._effects.get_for_update(
                job_id=job.id,
                owner_attempt_id=attempt.id,
                effect_key=registration.effect_key,
                conn=conn,
            )
            if effect is None:
                effect = await self._effects.create_effect(
                    run=run,
                    job=job,
                    attempt=attempt,
                    effect_key=registration.effect_key,
                    request_hash=registration.request_hash,
                    registered_at=control.observed_at,
                    conn=conn,
                )
            else:
                self._validate_registration_replay(effect=effect, registration=registration)
                if effect.disposition == AgentRunExecutionEffectDisposition.ACTIVE:
                    raise JobExecutionStateInvariantError(
                        "Agent execution effect is already active for this fenced Attempt"
                    )
                if effect.disposition == AgentRunExecutionEffectDisposition.UNKNOWN:
                    raise JobExecutionStateInvariantError(
                        "Agent execution effect has an unknown outcome and cannot be replayed"
                    )
            await self._renew(attempt=attempt, control=control, conn=conn)
            return _snapshot(effect)

    async def commit(
        self,
        *,
        lease: JobExecutionLease,
        effect_id: UUID,
        outcome: JsonObject,
    ) -> AgentRunExecutionEffectSnapshot:
        return await self._settle(
            lease=lease,
            effect_id=effect_id,
            disposition=AgentRunExecutionEffectDisposition.COMMITTED,
            outcome=outcome,
            error_code=None,
        )

    async def mark_unknown(
        self,
        *,
        lease: JobExecutionLease,
        effect_id: UUID,
        error_code: str,
    ) -> AgentRunExecutionEffectSnapshot:
        return await self._settle(
            lease=lease,
            effect_id=effect_id,
            disposition=AgentRunExecutionEffectDisposition.UNKNOWN,
            outcome=None,
            error_code=error_code,
        )

    async def _settle(
        self,
        *,
        lease: JobExecutionLease,
        effect_id: UUID,
        disposition: AgentRunExecutionEffectDisposition,
        outcome: JsonObject | None,
        error_code: str | None,
    ) -> AgentRunExecutionEffectSnapshot:
        outcome_hash = hash_json(outcome) if outcome is not None else None
        async with self.tx() as conn:
            job, attempt, _, control = await self._locked_execution(lease=lease, run_id=None, conn=conn)
            effect = await self._effect_for_update(
                effect_id=effect_id,
                job_id=job.id,
                attempt_id=attempt.id,
                conn=conn,
            )
            if effect.disposition != AgentRunExecutionEffectDisposition.ACTIVE:
                self._validate_settlement_replay(
                    effect=effect,
                    disposition=disposition,
                    outcome=outcome,
                    outcome_hash=outcome_hash,
                    error_code=error_code,
                )
            else:
                await self._effects.settle(
                    effect=effect,
                    disposition=disposition,
                    settled_at=control.observed_at,
                    outcome=outcome,
                    outcome_hash=outcome_hash,
                    error_code=error_code,
                    conn=conn,
                )
            await self._renew(attempt=attempt, control=control, conn=conn)
            return _snapshot(effect)

    async def load_latest_for_job(self, *, job_id: UUID) -> AgentRunExecutionEffectSnapshot | None:
        effect = await self._effects.latest_for_job(job_id=job_id)
        return _snapshot(effect) if effect is not None else None

    async def _locked_execution(
        self,
        *,
        lease: JobExecutionLease,
        run_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> tuple[BackgroundJobRecord, JobAttemptRecord, AgentRunV1Record, JobExecutionControlSnapshot]:
        job = await self._jobs.get_job_for_update(job_id=lease.job_id, conn=conn)
        attempt = await self._jobs.get_job_attempt_for_update(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            conn=conn,
        )
        if job is None or attempt is None:
            raise JobExecutionStateInvariantError("Agent execution effect lost its Job or Attempt")
        control = await self._control(job=job, attempt=attempt, lease=lease, conn=conn)
        run_query = AgentRunV1Record.filter(job_id=job.id)
        if run_id is not None:
            run_query = run_query.filter(id=run_id)
        run = await run_query.using_db(conn).select_for_update().first()
        if run is None:
            raise JobExecutionStateInvariantError("Agent execution effect does not belong to the current Run Job")
        return job, attempt, run, control

    async def _control(
        self,
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
        lease: JobExecutionLease,
        conn: BaseDBAsyncClient,
    ) -> JobExecutionControlSnapshot:
        observed_at = await self._jobs.get_database_time(conn=conn)
        return build_execution_control_snapshot(job=job, attempt=attempt, lease=lease, observed_at=observed_at)

    async def _renew(
        self,
        *,
        attempt: JobAttemptRecord,
        control: JobExecutionControlSnapshot,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._jobs.heartbeat_attempt(
            attempt=attempt,
            heartbeat_at=control.observed_at,
            lease_until=control.lease_until,
            conn=conn,
        )

    async def _effect_for_update(
        self,
        *,
        effect_id: UUID,
        job_id: UUID,
        attempt_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunExecutionEffectRecord:
        effect = await self._effects.get_by_id_for_update(
            effect_id=effect_id,
            job_id=job_id,
            owner_attempt_id=attempt_id,
            conn=conn,
        )
        if effect is None:
            raise JobExecutionStateInvariantError("Agent execution effect does not match its fenced Attempt")
        return effect

    @staticmethod
    def _validate_registration_replay(
        *,
        effect: AgentRunExecutionEffectRecord,
        registration: AgentRunExecutionEffectRegistration,
    ) -> None:
        if effect.run_id != registration.run_id or effect.request_hash != registration.request_hash:
            raise JobExecutionStateInvariantError("Agent execution effect registration replay changed its identity")

    @staticmethod
    def _validate_settlement_replay(
        *,
        effect: AgentRunExecutionEffectRecord,
        disposition: AgentRunExecutionEffectDisposition,
        outcome: JsonObject | None,
        outcome_hash: str | None,
        error_code: str | None,
    ) -> None:
        if (
            effect.disposition != disposition
            or effect.outcome != outcome
            or effect.outcome_hash != outcome_hash
            or effect.error_code != error_code
        ):
            raise JobExecutionStateInvariantError("Agent execution effect settlement replay changed its receipt")


def _snapshot(effect: AgentRunExecutionEffectRecord) -> AgentRunExecutionEffectSnapshot:
    outcome = effect.outcome if isinstance(effect.outcome, dict) else None
    if outcome is not None and hash_json(outcome) != effect.outcome_hash:
        raise JobExecutionStateInvariantError("Agent execution effect outcome hash is invalid")
    return AgentRunExecutionEffectSnapshot(
        id=effect.id,
        run_id=effect.run_id,
        job_id=effect.job_id,
        owner_attempt_id=effect.owner_attempt_id,
        effect_key=effect.effect_key,
        request_hash=effect.request_hash,
        disposition=AgentRunExecutionEffectDisposition(effect.disposition),
        outcome=outcome,
        outcome_hash=effect.outcome_hash,
        error_code=effect.error_code,
        registered_at=effect.registered_at,
        settled_at=effect.settled_at,
    )
