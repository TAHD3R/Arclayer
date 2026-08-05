from __future__ import annotations

from typing import Any

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.commerce.access_facts import CommercialAccessFact, CommercialAccessFactKind
from src.modules.commerce.access_state.fact_consumer_job_contract import (
    COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE,
    COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE_VERSION,
    CommercialAccessFactJobInput,
    CommercialAccessFactJobTarget,
    commercial_access_fact_source_revision,
)
from src.modules.commerce.access_state.schema import CommercialAccessStateApplyResult
from src.modules.jobs.schema import BackgroundJobCreate
from src.modules.jobs.service import BackgroundJobService


class TortoiseCommercialAccessFactOutbox:
    """Persists downstream facts in the same transaction as the Commerce transition."""

    def __init__(self, *, jobs: BackgroundJobService) -> None:
        self._jobs = jobs

    async def append_access_result(
        self,
        *,
        result: CommercialAccessStateApplyResult,
        conn: BaseDBAsyncClient,
    ) -> None:
        transition = result.transition
        await self._append(
            kind=CommercialAccessFactKind.LIFECYCLE_NOTIFICATION,
            source_identity=transition.transition_identity,
            workspace_id=transition.workspace_id,
            effective_at=transition.effective_at,
            payload={
                "milestone": result.notification.milestone,
                "recovery_deadline": _datetime_value(result.notification.recovery_deadline),
            },
            conn=conn,
        )
        if result.hosting_handoff is None:
            return
        handoff = result.hosting_handoff
        await self._append(
            kind=CommercialAccessFactKind.HOSTING_HANDOFF,
            source_identity=handoff.transition_identity,
            workspace_id=handoff.workspace_id,
            effective_at=handoff.effective_at,
            payload={"state": str(handoff.state), "cause": handoff.cause},
            conn=conn,
        )

    async def _append(
        self,
        *,
        kind: CommercialAccessFactKind,
        source_identity: str,
        workspace_id,
        effective_at,
        payload: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> None:
        fact, created = await CommercialAccessFact.get_or_create(
            kind=kind,
            source_identity=source_identity,
            defaults={
                "workspace_id": workspace_id,
                "payload": payload,
                "effective_at": effective_at,
            },
            using_db=conn,
        )
        if not created and (
            fact.workspace_id != workspace_id or fact.payload != payload or fact.effective_at != effective_at
        ):
            raise Conflict(error="COMMERCIAL_ACCESS_FACT_IMMUTABILITY_CONFLICT")
        await self._jobs.create_job_in_transaction(
            command=self._job_command(kind=kind, source_identity=source_identity),
            conn=conn,
        )

    def _job_command(
        self,
        *,
        kind: CommercialAccessFactKind,
        source_identity: str,
    ) -> BackgroundJobCreate:
        definition = self._jobs.registry.require(
            job_type=COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE,
            job_type_version=COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE_VERSION,
        )
        target = CommercialAccessFactJobTarget(kind=kind, source_identity=source_identity)
        input_reference = CommercialAccessFactJobInput(kind=kind, source_identity=source_identity)
        identity = commercial_access_fact_source_revision(target)
        return BackgroundJobCreate(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            authority_mode=definition.authority_mode,
            target_descriptor=target.model_dump(mode="json", by_alias=True),
            input_reference=input_reference.model_dump(mode="json", by_alias=True),
            idempotency_key=identity,
            source_revision=identity,
            correlation_id=identity,
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            status_key=definition.initial_status_key,
        )


def _datetime_value(value) -> str | None:
    return value.isoformat() if value is not None else None
