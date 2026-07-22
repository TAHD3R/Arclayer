from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest
from pydantic import ValidationError
from taskiq import AckableMessage, Context, TaskiqMessage
from taskiq.utils import maybe_awaitable

from src.common.types.json_types import JsonObject
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.jobs.execution_schema import (
    DurableJobExecutionOutcome,
    JobDeliveryClaim,
    JobDeliveryCommand,
    JobDeliveryDisposition,
)
from src.modules.jobs.schema import JobDispatchEnvelope
from src.platform.jobs.durable.ack import (
    DurableAckScopeError,
    DurableRedisStreamBroker,
    durable_ack_callback_scope,
    gated_ackable_message,
)
from src.platform.jobs.durable.delivery_handler import (
    DurableDeliveryExecutor,
    build_durable_delivery_handler,
)
from src.platform.jobs.durable.errors import (
    DurableTaskExecutionOutcomeError,
    DurableTaskRegistrationError,
)

pytestmark = pytest.mark.unit

NOW = datetime(2026, 7, 15, 16, tzinfo=UTC)
TASK_NAME = "jobs:asset-cpu:asset-thumbnail-generate:v1"


class RecordingExecutor:
    def __init__(self, result: DurableJobExecutionOutcome | BaseException | object) -> None:
        self.result = result
        self.commands: list[JobDeliveryCommand] = []

    async def execute_delivery(self, *, command: JobDeliveryCommand) -> DurableJobExecutionOutcome:
        self.commands.append(command)
        if isinstance(self.result, BaseException):
            raise self.result
        return cast(DurableJobExecutionOutcome, self.result)


def _envelope() -> JobDispatchEnvelope:
    return JobDispatchEnvelope(
        job_id=uuid4(),
        dispatch_sequence=1,
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        workload_class=JobWorkloadClass.ASSET_CPU,
        target_descriptor={"assetId": str(uuid4())},
        request_fingerprint="a" * 64,
    )


def _outcome(envelope: JobDispatchEnvelope) -> DurableJobExecutionOutcome:
    return DurableJobExecutionOutcome(
        delivery=JobDeliveryClaim(
            job_id=envelope.job_id,
            dispatch_sequence=envelope.dispatch_sequence,
            disposition=JobDeliveryDisposition.STALE_DELIVERY,
        )
    )


def _context(*, task_id: str = "taskiq-message-1") -> Context:
    broker = DurableRedisStreamBroker("redis://127.0.0.1:6379/15", queue_name="durable-handler-unit")
    message = TaskiqMessage(
        task_id=task_id,
        task_name=TASK_NAME,
        labels={},
        args=[],
        kwargs={},
    )
    return Context(message, broker)


def _ackable(acknowledged: list[str]) -> AckableMessage:
    async def acknowledge() -> None:
        acknowledged.append("acked")

    return gated_ackable_message(AckableMessage(data=b"delivery", ack=acknowledge))


@pytest.mark.asyncio
async def test_delivery_handler_authorizes_ack_only_after_typed_durable_outcome() -> None:
    envelope = _envelope()
    executor = RecordingExecutor(_outcome(envelope))
    handler = build_durable_delivery_handler(
        executor=executor,
        worker_id=" asset-worker-1 ",
        received_at_factory=lambda: NOW,
    )
    acknowledged: list[str] = []
    message = _ackable(acknowledged)

    with durable_ack_callback_scope():
        result = await handler(
            envelope.model_dump(mode="json", by_alias=True),
            context=_context(),
        )
        await maybe_awaitable(message.ack())

    diagnostic = DurableJobExecutionOutcome.model_validate(result)
    assert diagnostic.delivery.disposition == JobDeliveryDisposition.STALE_DELIVERY
    assert acknowledged == ["acked"]
    command = executor.commands[0]
    assert command.envelope == envelope
    assert command.worker_id == "asset-worker-1"
    assert command.transport_message_id == "taskiq-message-1"
    assert command.received_at == NOW


@pytest.mark.asyncio
async def test_delivery_handler_exception_surfaces_and_keeps_delivery_deferred() -> None:
    envelope = _envelope()
    executor = RecordingExecutor(RuntimeError("database unavailable"))
    handler = build_durable_delivery_handler(executor=executor, worker_id="asset-worker-1")
    acknowledged: list[str] = []
    message = _ackable(acknowledged)

    with durable_ack_callback_scope():
        with pytest.raises(RuntimeError, match="database unavailable"):
            await handler(envelope.model_dump(mode="json", by_alias=True), context=_context())
        await maybe_awaitable(message.ack())

    assert acknowledged == []


@pytest.mark.asyncio
async def test_delivery_handler_rejects_untyped_outcome_without_ack() -> None:
    envelope = _envelope()
    executor = RecordingExecutor({"delivery": "fabricated"})
    handler = build_durable_delivery_handler(
        executor=cast(DurableDeliveryExecutor, executor),
        worker_id="asset-worker-1",
    )
    acknowledged: list[str] = []
    message = _ackable(acknowledged)

    with durable_ack_callback_scope():
        with pytest.raises(DurableTaskExecutionOutcomeError, match="validated DurableJobExecutionOutcome"):
            await handler(envelope.model_dump(mode="json", by_alias=True), context=_context())
        await maybe_awaitable(message.ack())

    assert acknowledged == []


@pytest.mark.asyncio
async def test_delivery_handler_rejects_invalid_envelope_before_executor_and_ack() -> None:
    envelope = _envelope()
    executor = RecordingExecutor(_outcome(envelope))
    handler = build_durable_delivery_handler(executor=executor, worker_id="asset-worker-1")
    payload = cast(JsonObject, envelope.model_dump(mode="json", by_alias=True))
    payload["requestFingerprint"] = "invalid"
    acknowledged: list[str] = []
    message = _ackable(acknowledged)

    with durable_ack_callback_scope():
        with pytest.raises(ValidationError, match="requestFingerprint"):
            await handler(payload, context=_context())
        await maybe_awaitable(message.ack())

    assert executor.commands == []
    assert acknowledged == []


@pytest.mark.asyncio
async def test_delivery_handler_requires_receiver_ack_scope_after_durable_execution() -> None:
    envelope = _envelope()
    executor = RecordingExecutor(_outcome(envelope))
    handler = build_durable_delivery_handler(executor=executor, worker_id="asset-worker-1")

    with pytest.raises(DurableAckScopeError, match="active durable callback scope"):
        await handler(envelope.model_dump(mode="json", by_alias=True), context=_context())

    assert len(executor.commands) == 1


@pytest.mark.parametrize("worker_id", ["", "   ", "w" * 161])
def test_delivery_handler_rejects_invalid_worker_identity_at_composition(worker_id: str) -> None:
    executor = RecordingExecutor(object())

    with pytest.raises(DurableTaskRegistrationError, match="1 to 160"):
        build_durable_delivery_handler(
            executor=cast(DurableDeliveryExecutor, executor),
            worker_id=worker_id,
        )
