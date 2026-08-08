from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Protocol

from taskiq import Context, TaskiqDepends

from src.common.types.json_types import JsonObject
from src.core.exceptions.types import Conflict
from src.modules.jobs.execution_schema import (
    DurableJobExecutionOutcome,
    JobDeliveryClaim,
    JobDeliveryCommand,
    JobDeliveryDisposition,
)
from src.modules.jobs.schema import JobDispatchEnvelope
from src.platform.jobs.durable.ack import authorize_durable_ack
from src.platform.jobs.durable.errors import (
    DurableTaskExecutionOutcomeError,
    DurableTaskRegistrationError,
)


class DurableDeliveryExecutor(Protocol):
    async def execute_delivery(
        self,
        *,
        command: JobDeliveryCommand,
    ) -> DurableJobExecutionOutcome: ...


DurableDeliveryHandler = Callable[..., Awaitable[JsonObject]]


def build_durable_delivery_handler(
    *,
    executor: DurableDeliveryExecutor,
    worker_id: str,
    received_at_factory: Callable[[], datetime] | None = None,
) -> DurableDeliveryHandler:
    """Build the only Taskiq wrapper allowed to authorize a durable transport ACK."""

    normalized_worker_id = worker_id.strip()
    if not normalized_worker_id or len(normalized_worker_id) > 160:
        raise DurableTaskRegistrationError("durable worker ID must contain 1 to 160 characters")
    clock = received_at_factory or _utc_now

    async def execute_durable_delivery(
        payload: JsonObject,
        context: Context = TaskiqDepends(),
    ) -> JsonObject:
        envelope = JobDispatchEnvelope.model_validate(payload)
        command = JobDeliveryCommand(
            task_name=context.message.task_name,
            envelope=envelope,
            worker_id=normalized_worker_id,
            transport_message_id=context.message.task_id,
            received_at=clock(),
        )
        try:
            outcome = await executor.execute_delivery(command=command)
        except Conflict as error:
            if error.error != "BACKGROUND_JOB_NOT_CLAIMABLE":
                raise
            outcome = DurableJobExecutionOutcome(
                delivery=JobDeliveryClaim(
                    job_id=envelope.job_id,
                    dispatch_sequence=envelope.dispatch_sequence,
                    disposition=JobDeliveryDisposition.STALE_DELIVERY,
                )
            )
        if not isinstance(outcome, DurableJobExecutionOutcome):
            raise DurableTaskExecutionOutcomeError(
                "durable executor must return a validated DurableJobExecutionOutcome"
            )
        diagnostic = outcome.model_dump(mode="json", by_alias=True)
        authorize_durable_ack()
        return diagnostic

    return execute_durable_delivery


def _utc_now() -> datetime:
    return datetime.now(UTC)
