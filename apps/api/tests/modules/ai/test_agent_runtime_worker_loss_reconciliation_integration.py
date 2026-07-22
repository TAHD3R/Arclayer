from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import decode_public_id
from src.config import get_settings
from src.llm.runtime import LLMRequestContext
from src.models.agents.runtime_v1 import (
    AgentMessagePartV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
)
from src.models.ai.ai_budget import AIBudget, BudgetSourceType
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.modules.ai.runtime_job_event_factory import AgentRunJobEventFactory
from src.modules.ai.runtime_job_repository import AgentRunJobRepository
from src.modules.ai.runtime_job_schema import AgentRunJobInput, AgentRunJobTarget
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.service import AIChatService
from src.modules.jobs.execution_schema import (
    JobDeliveryCommand,
    JobDeliveryDisposition,
)
from src.modules.jobs.schema import JobDispatchEnvelope
from src.platform.jobs.composition.execution import JobExecutionRuntime, build_job_execution_runtime
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


async def _create_queued_run(
    *,
    client,
    workspace_public_id: str,
    project_public_id: str,
    label: str,
) -> tuple[AgentRunV1Record, BackgroundJobRecord, JobDispatchOutboxRecord]:
    catalog_response = await client.get(
        f"/api/v1/workspaces/{workspace_public_id}/agents",
        params={"projectId": project_public_id},
    )
    assert catalog_response.status_code == 200, catalog_response.text
    lead_agent_id = catalog_response.json()["data"]["defaultAgentId"]

    thread = await client.post(
        f"/api/v1/workspaces/{workspace_public_id}/ai/threads",
        headers={"Idempotency-Key": f"worker-loss-thread-{label}-{uuid4().hex}"},
        json={
            "projectId": project_public_id,
            "leadAgentId": lead_agent_id,
            "title": f"Worker loss {label}",
        },
    )
    assert thread.status_code == 201, thread.text
    thread_public_id = thread.json()["data"]["threadId"]

    run = await client.post(
        f"/api/v1/workspaces/{workspace_public_id}/ai/threads/{thread_public_id}/runs",
        headers={"Idempotency-Key": f"worker-loss-{label}-{uuid4().hex}"},
        json={
            "projectId": project_public_id,
            "leadAgentId": lead_agent_id,
            "executionMode": "build",
            "message": f"Build the {label} recovery proof.",
        },
    )
    assert run.status_code == 202, run.text
    run_id = decode_public_id(run.json()["data"]["runId"])
    persisted_run = await AgentRunV1Record.get(id=run_id)
    job = await BackgroundJobRecord.get(id=persisted_run.job_id)
    dispatch = await JobDispatchOutboxRecord.get(job_id=job.id, dispatch_sequence=1)
    return persisted_run, job, dispatch


async def _mark_dispatch_accepted(dispatch: JobDispatchOutboxRecord) -> JobDispatchEnvelope:
    envelope = JobDispatchEnvelope.model_validate(dispatch.envelope)
    accepted_at = datetime.now(UTC)
    await JobDispatchOutboxRecord.filter(id=dispatch.id).update(
        status=JobDispatchStatus.DISPATCHED,
        dispatched_at=accepted_at,
        task_message_id=f"worker-loss-{dispatch.dispatch_sequence}-{uuid4().hex}",
    )
    return envelope


def _delivery_command(
    *,
    dispatch: JobDispatchOutboxRecord,
    envelope: JobDispatchEnvelope,
) -> JobDeliveryCommand:
    return JobDeliveryCommand(
        task_name=dispatch.task_name,
        envelope=envelope,
        worker_id=f"agent-recovery-worker-{dispatch.dispatch_sequence}",
        transport_message_id=f"worker-loss-delivery-{dispatch.dispatch_sequence}-{uuid4().hex}",
        received_at=datetime.now(UTC),
    )


async def _start_provider_effect_then_lose_worker(
    *,
    runtime: JobExecutionRuntime,
    run: AgentRunV1Record,
    job: BackgroundJobRecord,
    dispatch: JobDispatchOutboxRecord,
    reservation_status: ReservationStatus,
) -> None:
    envelope = await _mark_dispatch_accepted(dispatch)
    claim = await runtime.executor.execution.accept_delivery(_delivery_command(dispatch=dispatch, envelope=envelope))
    assert claim.disposition == JobDeliveryDisposition.CLAIMED
    assert claim.lease is not None

    target = AgentRunJobTarget.model_validate(job.target_descriptor)
    input_reference = AgentRunJobInput.model_validate(job.input_reference)
    job_repository = AgentRunJobRepository()
    state = await job_repository.get_state(
        job_id=job.id,
        actor_user_id=run.owner_user_id,
        target=target,
        input_reference=input_reference,
    )
    event_repository = AgentRuntimeRepository()
    await event_repository.append_event(
        event=AgentRunJobEventFactory(state).run_started(
            sequence=state.last_sequence + 1,
            occurred_at=datetime.now(UTC),
            attempt_number=claim.lease.attempt_number,
        )
    )
    state = await job_repository.get_state(
        job_id=job.id,
        actor_user_id=run.owner_user_id,
        target=target,
        input_reference=input_reference,
    )
    identity = AgentRunJobEventFactory(state).new_message_identity()
    await event_repository.append_event(
        event=AgentRunJobEventFactory(state).message_started(
            sequence=state.last_sequence + 1,
            occurred_at=datetime.now(UTC),
            identity=identity,
        )
    )
    await _create_reservation(run=run, status=reservation_status)

    await JobAttemptRecord.filter(id=claim.lease.attempt_id).update(
        lease_until=datetime.now(UTC) - timedelta(seconds=1),
    )
    reaped = await runtime.executor.lease_reaper.reap_exact(
        job_id=job.id,
        attempt_id=claim.lease.attempt_id,
    )
    assert reaped.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert await JobAttemptRecord.filter(
        id=claim.lease.attempt_id,
        status=JobAttemptStatus.LEASE_EXPIRED,
    ).exists()


async def _create_reservation(
    *,
    run: AgentRunV1Record,
    status: ReservationStatus,
) -> None:
    actual_cost = 2_000 if status == ReservationStatus.COMMITTED else None
    budget = await AIBudget.create(
        source_type=BudgetSourceType.WORKSPACE,
        source_id=run.workspace_id,
        limit_micros=100_000,
        spent_micros=actual_cost or 0,
        period_start=datetime.now(UTC).date(),
    )
    await AIBudgetReservation.create(
        budget_id=budget.id,
        agent_run_id=run.id,
        request_id=uuid4(),
        estimated_cost_micros=3_000,
        reserved_cost_micros=3_000,
        actual_cost_micros=actual_cost,
        status=status,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )


async def _execute_retry(
    *,
    runtime: JobExecutionRuntime,
    job_id: UUID,
) -> None:
    dispatch = await JobDispatchOutboxRecord.get(job_id=job_id, dispatch_sequence=2)
    envelope = await _mark_dispatch_accepted(dispatch)
    outcome = await runtime.executor.execute_delivery(command=_delivery_command(dispatch=dispatch, envelope=envelope))
    assert outcome.delivery.disposition == JobDeliveryDisposition.CLAIMED
    assert outcome.terminal is not None


async def _runtime_without_provider_calls(
    monkeypatch: pytest.MonkeyPatch,
    calls: list[LLMRequestContext],
) -> JobExecutionRuntime:
    async def unexpected_chat(
        _service: AIChatService,
        _messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
    ) -> JsonObject:
        _ = model
        calls.append(context)
        raise AssertionError("worker-loss reconciliation must not repeat the provider effect")

    monkeypatch.setattr(AIChatService, "chat", unexpected_chat)
    return build_job_execution_runtime(
        settings=get_settings(),
        workload_class=JobWorkloadClass.AGENT_IO,
    )


async def test_reserved_provider_effect_retries_settlement_without_repeating_provider(
    prepared_db,
    integration_valkey_settings: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[LLMRequestContext] = []
    runtime = await _runtime_without_provider_calls(monkeypatch, calls)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        client,
        workspace_public_id,
        project_public_id,
    ):
        run, job, dispatch = await _create_queued_run(
            client=client,
            workspace_public_id=workspace_public_id,
            project_public_id=project_public_id,
            label="reserved",
        )
        await _start_provider_effect_then_lose_worker(
            runtime=runtime,
            run=run,
            job=job,
            dispatch=dispatch,
            reservation_status=ReservationStatus.RESERVED,
        )
        await _execute_retry(runtime=runtime, job_id=job.id)

    refreshed_job = await BackgroundJobRecord.get(id=job.id)
    refreshed_run = await AgentRunV1Record.get(id=run.id)
    assert refreshed_job.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert refreshed_job.error_code == "AGENT_RUN_SETTLEMENT_PENDING"
    assert refreshed_run.status == AgentRunStatusV1.RUNNING
    assert await JobAttemptRecord.filter(job_id=job.id).count() == 2
    assert await JobDispatchOutboxRecord.filter(job_id=job.id).count() == 3
    assert calls == []


@pytest.mark.parametrize("reservation_status", [ReservationStatus.COMMITTED, ReservationStatus.RELEASED])
async def test_settled_provider_effect_fails_run_without_repeating_provider(
    prepared_db,
    integration_valkey_settings: str,
    monkeypatch: pytest.MonkeyPatch,
    reservation_status: ReservationStatus,
) -> None:
    calls: list[LLMRequestContext] = []
    runtime = await _runtime_without_provider_calls(monkeypatch, calls)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        client,
        workspace_public_id,
        project_public_id,
    ):
        run, job, dispatch = await _create_queued_run(
            client=client,
            workspace_public_id=workspace_public_id,
            project_public_id=project_public_id,
            label=reservation_status.value,
        )
        await _start_provider_effect_then_lose_worker(
            runtime=runtime,
            run=run,
            job=job,
            dispatch=dispatch,
            reservation_status=reservation_status,
        )
        await _execute_retry(runtime=runtime, job_id=job.id)

    refreshed_job = await BackgroundJobRecord.get(id=job.id)
    refreshed_run = await AgentRunV1Record.get(id=run.id)
    parts = await AgentMessagePartV1Record.filter(message__run_id=run.id).all()
    assert refreshed_job.internal_status == JobInternalStatus.FAILED
    assert refreshed_job.error_code == "AGENT_RUN_EXECUTION_FAILED"
    assert refreshed_job.error_metadata == {
        "publicErrorCode": "AGENT_PROVIDER_RESULT_UNAVAILABLE",
    }
    assert refreshed_run.status == AgentRunStatusV1.FAILED
    assert refreshed_run.error["code"] == "AGENT_PROVIDER_RESULT_UNAVAILABLE"
    assert [part.status for part in parts if part.type == "text"] == ["complete", "incomplete"]
    assert await JobAttemptRecord.filter(job_id=job.id).count() == 2
    assert await JobDispatchOutboxRecord.filter(job_id=job.id).count() == 2
    assert calls == []
