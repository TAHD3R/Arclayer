from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.agents.runtime_recovery_v1 import AgentRunExecutionEffectDisposition
from src.models.agents.runtime_v1 import AgentRunV1Record
from src.models.jobs.background_job import BackgroundJobRecord, JobAttemptRecord, JobWorkloadClass
from src.modules.ai.runtime_execution_effect_service import AgentRunExecutionEffectService
from src.modules.ai.runtime_recovery_repository import AgentRunExecutionEffectRepository
from src.modules.ai.runtime_recovery_schema import AgentRunExecutionEffectRegistration
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.execution_schema import (
    JobExecutionControlSnapshot,
    JobExecutionLease,
)


class _Effects:
    def __init__(self) -> None:
        self.effect: SimpleNamespace | None = None

    async def get_for_update(self, **kwargs) -> SimpleNamespace | None:  # type: ignore[no-untyped-def]
        _ = kwargs
        return self.effect

    async def create_effect(self, **kwargs) -> SimpleNamespace:  # type: ignore[no-untyped-def]
        self.effect = SimpleNamespace(
            id=uuid4(),
            run_id=kwargs["run"].id,
            job_id=kwargs["job"].id,
            owner_attempt_id=kwargs["attempt"].id,
            effect_key=kwargs["effect_key"],
            request_hash=kwargs["request_hash"],
            disposition=AgentRunExecutionEffectDisposition.ACTIVE,
            outcome=None,
            outcome_hash=None,
            error_code=None,
            registered_at=kwargs["registered_at"],
            settled_at=None,
        )
        return self.effect

    async def get_by_id_for_update(self, **kwargs) -> SimpleNamespace | None:  # type: ignore[no-untyped-def]
        effect = self.effect
        if effect is None:
            return None
        if (effect.id, effect.job_id, effect.owner_attempt_id) != (
            kwargs["effect_id"],
            kwargs["job_id"],
            kwargs["owner_attempt_id"],
        ):
            return None
        return effect

    async def settle(self, **kwargs) -> None:  # type: ignore[no-untyped-def]
        effect = kwargs["effect"]
        effect.disposition = kwargs["disposition"]
        effect.settled_at = kwargs["settled_at"]
        effect.outcome = kwargs["outcome"]
        effect.outcome_hash = kwargs["outcome_hash"]
        effect.error_code = kwargs["error_code"]


class _Service(AgentRunExecutionEffectService):
    def __init__(self) -> None:
        self.effects = _Effects()
        super().__init__(
            Settings(app_env="test", database={"enabled": False}),
            effects=cast(AgentRunExecutionEffectRepository, self.effects),
        )
        now = datetime.now(UTC)
        self.job = cast(BackgroundJobRecord, SimpleNamespace(id=uuid4()))
        self.attempt = cast(JobAttemptRecord, SimpleNamespace(id=uuid4()))
        self.run = cast(AgentRunV1Record, SimpleNamespace(id=uuid4()))
        self.control = JobExecutionControlSnapshot(
            job_id=self.job.id,
            attempt_id=self.attempt.id,
            fencing_token=uuid4(),
            observed_at=now,
            lease_until=now + timedelta(minutes=2),
        )

    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        if conn is not None:
            yield conn
            return
        yield BaseDBAsyncClient("agent-execution-effect-test")

    async def _locked_execution(  # type: ignore[override]
        self,
        **kwargs,
    ) -> tuple[BackgroundJobRecord, JobAttemptRecord, AgentRunV1Record, JobExecutionControlSnapshot]:
        _ = kwargs
        return self.job, self.attempt, self.run, self.control

    async def _renew(self, **kwargs) -> None:  # type: ignore[override,no-untyped-def]
        _ = kwargs


def _lease(service: _Service) -> JobExecutionLease:
    return JobExecutionLease(
        job_id=service.job.id,
        attempt_id=service.attempt.id,
        dispatch_sequence=1,
        attempt_number=1,
        worker_id="effect-unit-worker",
        fencing_token=service.control.fencing_token,
        job_type="agent.run.execute",
        job_type_version=1,
        workload_class=JobWorkloadClass.AGENT_IO,
        claimed_at=service.control.observed_at,
        lease_until=service.control.lease_until,
    )


def _registration(service: _Service) -> AgentRunExecutionEffectRegistration:
    return AgentRunExecutionEffectRegistration(
        run_id=service.run.id,
        effect_key="agent-provider-execute",
        request_hash="a" * 64,
    )


@pytest.mark.asyncio
async def test_effect_registration_is_attempt_fenced_and_active() -> None:
    service = _Service()

    effect = await service.register(lease=_lease(service), registration=_registration(service))

    assert effect.run_id == service.run.id
    assert effect.job_id == service.job.id
    assert effect.owner_attempt_id == service.attempt.id
    assert effect.disposition == AgentRunExecutionEffectDisposition.ACTIVE


@pytest.mark.asyncio
async def test_active_registration_replay_fails_instead_of_calling_provider_twice() -> None:
    service = _Service()
    lease = _lease(service)
    registration = _registration(service)
    await service.register(lease=lease, registration=registration)

    with pytest.raises(JobExecutionStateInvariantError, match="already active"):
        await service.register(lease=lease, registration=registration)


@pytest.mark.asyncio
async def test_committed_outcome_replay_is_immutable() -> None:
    service = _Service()
    lease = _lease(service)
    registered = await service.register(lease=lease, registration=_registration(service))
    outcome = cast(JsonObject, {"kind": "completed", "completionId": "completion-1"})

    committed = await service.commit(lease=lease, effect_id=registered.id, outcome=outcome)
    replayed = await service.commit(lease=lease, effect_id=registered.id, outcome=outcome)

    assert committed.disposition == AgentRunExecutionEffectDisposition.COMMITTED
    assert replayed == committed
    with pytest.raises(JobExecutionStateInvariantError, match="changed its receipt"):
        await service.commit(
            lease=lease,
            effect_id=registered.id,
            outcome={"kind": "completed", "completionId": "completion-2"},
        )


@pytest.mark.asyncio
async def test_unknown_outcome_cannot_be_rewritten_as_committed() -> None:
    service = _Service()
    lease = _lease(service)
    registered = await service.register(lease=lease, registration=_registration(service))

    unknown = await service.mark_unknown(
        lease=lease,
        effect_id=registered.id,
        error_code="AGENT_PROVIDER_OUTCOME_UNKNOWN",
    )

    assert unknown.disposition == AgentRunExecutionEffectDisposition.UNKNOWN
    with pytest.raises(JobExecutionStateInvariantError, match="changed its receipt"):
        await service.commit(
            lease=lease,
            effect_id=registered.id,
            outcome={"kind": "completed", "completionId": "late-result"},
        )
