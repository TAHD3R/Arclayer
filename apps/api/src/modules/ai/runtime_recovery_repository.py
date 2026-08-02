from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_recovery_v1 import (
    AgentRunExecutionEffectDisposition,
    AgentRunExecutionEffectRecord,
    AgentRunRecoveryAction,
    AgentRunRecoveryRecord,
    AgentRunRecoveryStatus,
)
from src.models.agents.runtime_v1 import AgentRunV1Record
from src.models.jobs.background_job import BackgroundJobRecord, JobAttemptRecord
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError


class AgentRunRecoveryRepository(TortoiseORMRepository[AgentRunRecoveryRecord]):
    def __init__(self) -> None:
        super().__init__(AgentRunRecoveryRecord)

    @staticmethod
    async def get_run_for_update(*, run_id: UUID, conn: BaseDBAsyncClient) -> AgentRunV1Record | None:
        return await AgentRunV1Record.filter(id=run_id).using_db(conn).select_for_update().first()

    @staticmethod
    async def get_job_for_update(*, job_id: UUID, conn: BaseDBAsyncClient) -> BackgroundJobRecord | None:
        return await BackgroundJobRecord.filter(id=job_id).using_db(conn).select_for_update().first()

    @staticmethod
    async def latest_attempt_for_job_for_update(
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> JobAttemptRecord | None:
        return await (
            JobAttemptRecord
            .filter(job_id=job_id)
            .using_db(conn)
            .order_by("-attempt_number")
            .select_for_update()
            .first()
        )

    @staticmethod
    async def get_by_idempotency_hash_for_update(
        *,
        idempotency_key_hash: str,
        conn: BaseDBAsyncClient,
    ) -> AgentRunRecoveryRecord | None:
        return await (
            AgentRunRecoveryRecord
            .filter(idempotency_key_hash=idempotency_key_hash)
            .using_db(conn)
            .select_for_update()
            .first()
        )

    @staticmethod
    async def next_generation(*, run_id: UUID, conn: BaseDBAsyncClient) -> int:
        latest = await (
            AgentRunRecoveryRecord
            .filter(run_id=run_id)
            .using_db(conn)
            .order_by("-generation")
            .first()
        )
        return 1 if latest is None else latest.generation + 1

    async def create_recovery(
        self,
        *,
        run: AgentRunV1Record,
        source_job: BackgroundJobRecord,
        action: AgentRunRecoveryAction,
        generation: int,
        actor_user_id: UUID,
        idempotency_key_hash: str,
        request_fingerprint: str,
        correlation_id: UUID,
        reason: str | None,
        accepted_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> AgentRunRecoveryRecord:
        return await self.create_record(
            AgentRunRecoveryRecord,
            conn=conn,
            run=run,
            source_job=source_job,
            action=action,
            status=AgentRunRecoveryStatus.ACCEPTED,
            generation=generation,
            source_run_sequence=run.last_sequence,
            source_job_status=str(source_job.internal_status),
            actor_user_id=actor_user_id,
            idempotency_key_hash=idempotency_key_hash,
            request_fingerprint=request_fingerprint,
            correlation_id=correlation_id,
            reason=reason,
            accepted_at=accepted_at,
        )

    @staticmethod
    async def bind_recovery_job(
        *,
        recovery: AgentRunRecoveryRecord,
        job: BackgroundJobRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        recovery.recovery_job_id = job.id
        await recovery.save(update_fields=["recovery_job_id", "updated_at"], using_db=conn)

    @staticmethod
    async def mark_running(
        *,
        recovery_id: UUID,
        recovery_job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunRecoveryRecord:
        recovery = await (
            AgentRunRecoveryRecord
            .filter(id=recovery_id, recovery_job_id=recovery_job_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if recovery is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_RECOVERY_EXECUTION_BINDING_MISSING")
        if recovery.status == AgentRunRecoveryStatus.ACCEPTED:
            recovery.status = AgentRunRecoveryStatus.RUNNING
            await recovery.save(update_fields=["status", "updated_at"], using_db=conn)
        elif recovery.status != AgentRunRecoveryStatus.RUNNING:
            raise AgentRuntimePersistenceError("AGENT_RUN_RECOVERY_TERMINAL_CONFLICT")
        return recovery

    @staticmethod
    async def complete(
        *,
        recovery_id: UUID,
        recovery_job_id: UUID,
        status: AgentRunRecoveryStatus,
        completed_at: datetime,
        evidence: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        if status not in {
            AgentRunRecoveryStatus.SUCCEEDED,
            AgentRunRecoveryStatus.FAILED,
            AgentRunRecoveryStatus.CANCELLED,
        }:
            raise ValueError("Agent Run recovery completion requires a terminal status")
        recovery = await (
            AgentRunRecoveryRecord
            .filter(id=recovery_id, recovery_job_id=recovery_job_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if recovery is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_RECOVERY_EXECUTION_BINDING_MISSING")
        if recovery.status in {
            AgentRunRecoveryStatus.SUCCEEDED,
            AgentRunRecoveryStatus.FAILED,
            AgentRunRecoveryStatus.CANCELLED,
        }:
            if recovery.status != status or recovery.evidence != evidence:
                raise AgentRuntimePersistenceError("AGENT_RUN_RECOVERY_COMPLETION_REPLAY_CONFLICT")
            return
        recovery.status = status
        recovery.completed_at = completed_at
        recovery.evidence = evidence
        await recovery.save(
            update_fields=["status", "completed_at", "evidence", "updated_at"],
            using_db=conn,
        )


class AgentRunExecutionEffectRepository(TortoiseORMRepository[AgentRunExecutionEffectRecord]):
    def __init__(self) -> None:
        super().__init__(AgentRunExecutionEffectRecord)

    @staticmethod
    async def get_for_update(
        *,
        job_id: UUID,
        owner_attempt_id: UUID,
        effect_key: str,
        conn: BaseDBAsyncClient,
    ) -> AgentRunExecutionEffectRecord | None:
        return await (
            AgentRunExecutionEffectRecord
            .filter(job_id=job_id, owner_attempt_id=owner_attempt_id, effect_key=effect_key)
            .using_db(conn)
            .select_for_update()
            .first()
        )

    @staticmethod
    async def get_by_id_for_update(
        *,
        effect_id: UUID,
        job_id: UUID,
        owner_attempt_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunExecutionEffectRecord | None:
        return await (
            AgentRunExecutionEffectRecord
            .filter(id=effect_id, job_id=job_id, owner_attempt_id=owner_attempt_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def create_effect(
        self,
        *,
        run: AgentRunV1Record,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
        effect_key: str,
        request_hash: str,
        registered_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> AgentRunExecutionEffectRecord:
        return await self.create_record(
            AgentRunExecutionEffectRecord,
            conn=conn,
            run=run,
            job=job,
            owner_attempt=attempt,
            effect_key=effect_key,
            request_hash=request_hash,
            disposition=AgentRunExecutionEffectDisposition.ACTIVE,
            registered_at=registered_at,
        )

    @staticmethod
    async def settle(
        *,
        effect: AgentRunExecutionEffectRecord,
        disposition: AgentRunExecutionEffectDisposition,
        settled_at: datetime,
        outcome: JsonObject | None,
        outcome_hash: str | None,
        error_code: str | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        effect.disposition = disposition
        effect.settled_at = settled_at
        effect.outcome = outcome
        effect.outcome_hash = outcome_hash
        effect.error_code = error_code
        await effect.save(
            update_fields=[
                "disposition",
                "settled_at",
                "outcome",
                "outcome_hash",
                "error_code",
                "updated_at",
            ],
            using_db=conn,
        )

    @staticmethod
    async def latest_for_job(
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> AgentRunExecutionEffectRecord | None:
        return await (
            AgentRunExecutionEffectRecord
            .filter(job_id=job_id)
            .using_db(conn)
            .order_by("-registered_at", "-id")
            .first()
        )

    @staticmethod
    async def latest_for_job_for_update(
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunExecutionEffectRecord | None:
        return await (
            AgentRunExecutionEffectRecord
            .filter(job_id=job_id)
            .using_db(conn)
            .order_by("-registered_at", "-id")
            .select_for_update()
            .first()
        )
