from __future__ import annotations

import asyncio
from collections.abc import Callable, Coroutine
from typing import Any
from uuid import uuid4

import pytest
from redis.asyncio import Redis
from taskiq.acks import AcknowledgeType
from taskiq.receiver import Receiver
from taskiq_redis import RedisStreamBroker

from src.config import get_settings
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.jobs.execution_schema import (
    DurableJobExecutionOutcome,
    JobDeliveryClaim,
    JobDeliveryCommand,
    JobDeliveryDisposition,
)
from src.modules.jobs.schema import JobDispatchEnvelope
from src.platform.jobs.durable.ack import (
    DurableAckReceiver,
    DurableRedisStreamBroker,
    authorize_durable_ack,
)
from src.platform.jobs.durable.delivery_handler import build_durable_delivery_handler

pytestmark = pytest.mark.integration

_READ_BLOCK_MS = 25
_IDLE_TIMEOUT_MS = 60_000
_WAIT_SECONDS = 3
_DURABLE_TASK_NAME = "jobs:asset-cpu:asset-thumbnail-generate:v1"


class _RecordingDeliveryExecutor:
    def __init__(self, *, error: BaseException | None = None) -> None:
        self.error = error
        self.commands: list[JobDeliveryCommand] = []

    async def execute_delivery(self, *, command: JobDeliveryCommand) -> DurableJobExecutionOutcome:
        self.commands.append(command)
        if self.error is not None:
            raise self.error
        return DurableJobExecutionOutcome(
            delivery=JobDeliveryClaim(
                job_id=command.envelope.job_id,
                dispatch_sequence=command.envelope.dispatch_sequence,
                disposition=JobDeliveryDisposition.STALE_DELIVERY,
            )
        )


def _stream(prefix: str) -> str:
    return f"{prefix}:durable-ack:{uuid4().hex}"


def _broker(
    broker_type: type[RedisStreamBroker],
    *,
    dsn: str,
    stream: str,
) -> RedisStreamBroker:
    return broker_type(
        url=dsn,
        queue_name=stream,
        consumer_group_name=f"{stream}:workers",
        consumer_name="ack-gate-test-worker",
        consumer_id="0-0",
        xread_block=_READ_BLOCK_MS,
        xread_count=2,
        idle_timeout=_IDLE_TIMEOUT_MS,
        unacknowledged_batch_size=2,
        unacknowledged_lock_timeout=1,
    )


async def _run_plain_receiver_once(broker: RedisStreamBroker) -> None:
    receiver = Receiver(
        broker,
        run_startup=False,
        ack_type=AcknowledgeType.WHEN_SAVED,
        max_async_tasks=1,
        max_prefetch=1,
        max_tasks_to_execute=1,
        wait_tasks_timeout=1,
    )
    await asyncio.wait_for(receiver.listen(asyncio.Event()), timeout=_WAIT_SECONDS)


async def _run_durable_receiver(
    broker: DurableRedisStreamBroker,
    *,
    task_count: int = 1,
) -> None:
    receiver = DurableAckReceiver(
        broker,
        run_startup=False,
        ack_type=AcknowledgeType.WHEN_SAVED,
        max_async_tasks=task_count,
        max_prefetch=task_count,
        max_tasks_to_execute=task_count,
        wait_tasks_timeout=1,
    )
    await asyncio.wait_for(receiver.listen(asyncio.Event()), timeout=_WAIT_SECONDS)


async def _exercise_single_delivery(
    *,
    prefix: str,
    handler: Callable[[], Coroutine[Any, Any, None]],
) -> int:
    settings = get_settings()
    stream = _stream(prefix)
    broker = _broker(DurableRedisStreamBroker, dsn=settings.valkey.dsn, stream=stream)
    assert isinstance(broker, DurableRedisStreamBroker)
    redis = Redis.from_url(settings.valkey.dsn)
    task = broker.register_task(handler, task_name=f"evidence:durable-ack:{uuid4().hex}:v1")

    try:
        await redis.delete(stream)
        await broker.startup()
        await task.kiq()
        await _run_durable_receiver(broker)
        pending = await redis.xpending_range(stream, broker.consumer_group_name, "-", "+", 10)
        return len(pending)
    finally:
        await broker.shutdown()
        await redis.delete(stream)
        await redis.aclose()


async def _exercise_executor_wrapper(
    *,
    prefix: str,
    executor: _RecordingDeliveryExecutor,
) -> tuple[int, str]:
    settings = get_settings()
    stream = _stream(prefix)
    broker = _broker(DurableRedisStreamBroker, dsn=settings.valkey.dsn, stream=stream)
    assert isinstance(broker, DurableRedisStreamBroker)
    redis = Redis.from_url(settings.valkey.dsn)
    handler = build_durable_delivery_handler(executor=executor, worker_id="asset-worker-integration")
    task = broker.register_task(handler, task_name=_DURABLE_TASK_NAME)
    envelope = JobDispatchEnvelope(
        job_id=uuid4(),
        dispatch_sequence=1,
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        workload_class=JobWorkloadClass.ASSET_CPU,
        target_descriptor={"assetId": str(uuid4())},
        request_fingerprint="a" * 64,
    )

    try:
        await redis.delete(stream)
        await broker.startup()
        task_handle = await task.kiq(envelope.model_dump(mode="json", by_alias=True))
        await _run_durable_receiver(broker)
        pending = await redis.xpending_range(stream, broker.consumer_group_name, "-", "+", 10)
        return len(pending), task_handle.task_id
    finally:
        await broker.shutdown()
        await redis.delete(stream)
        await redis.aclose()


@pytest.mark.asyncio
async def test_locked_when_saved_receiver_acknowledges_ordinary_handler_error(
    integration_valkey_settings: str,
) -> None:
    settings = get_settings()
    stream = _stream(integration_valkey_settings)
    broker = _broker(RedisStreamBroker, dsn=settings.valkey.dsn, stream=stream)
    redis = Redis.from_url(settings.valkey.dsn)
    executed = asyncio.Event()

    async def fail() -> None:
        executed.set()
        raise RuntimeError("ordinary handler failure")

    task = broker.register_task(fail, task_name=f"evidence:plain-error:{uuid4().hex}:v1")

    try:
        await redis.delete(stream)
        await broker.startup()
        await task.kiq()
        await _run_plain_receiver_once(broker)

        assert executed.is_set()
        assert await redis.xpending_range(stream, broker.consumer_group_name, "-", "+", 10) == []
    finally:
        await broker.shutdown()
        await redis.delete(stream)
        await redis.aclose()


@pytest.mark.asyncio
async def test_gated_pre_execution_defer_and_handler_error_both_remain_pending(
    integration_valkey_settings: str,
) -> None:
    async def defer_before_execution() -> None:
        return None

    async def fail_before_authorization() -> None:
        raise RuntimeError("durable handler failure")

    deferred_count = await _exercise_single_delivery(
        prefix=integration_valkey_settings,
        handler=defer_before_execution,
    )
    failed_count = await _exercise_single_delivery(
        prefix=integration_valkey_settings,
        handler=fail_before_authorization,
    )

    assert deferred_count == 1
    assert failed_count == 1


@pytest.mark.asyncio
async def test_gated_delivery_is_xacked_only_after_explicit_safe_authorization(
    integration_valkey_settings: str,
) -> None:
    async def persist_then_authorize() -> None:
        authorize_durable_ack()

    pending_count = await _exercise_single_delivery(
        prefix=integration_valkey_settings,
        handler=persist_then_authorize,
    )

    assert pending_count == 0


@pytest.mark.asyncio
async def test_executor_wrapper_xacks_typed_outcome_and_defers_preclaim_failure(
    integration_valkey_settings: str,
) -> None:
    succeeded = _RecordingDeliveryExecutor()
    failed = _RecordingDeliveryExecutor(error=RuntimeError("database unavailable before claim"))

    succeeded_pending, task_id = await _exercise_executor_wrapper(
        prefix=integration_valkey_settings,
        executor=succeeded,
    )
    failed_pending, _ = await _exercise_executor_wrapper(
        prefix=integration_valkey_settings,
        executor=failed,
    )

    assert succeeded_pending == 0
    assert failed_pending == 1
    assert succeeded.commands[0].transport_message_id == task_id
    assert succeeded.commands[0].task_name == _DURABLE_TASK_NAME


@pytest.mark.asyncio
async def test_concurrent_real_deliveries_do_not_share_ack_authorization(
    integration_valkey_settings: str,
) -> None:
    settings = get_settings()
    stream = _stream(integration_valkey_settings)
    broker = _broker(DurableRedisStreamBroker, dsn=settings.valkey.dsn, stream=stream)
    assert isinstance(broker, DurableRedisStreamBroker)
    redis = Redis.from_url(settings.valkey.dsn)
    arrived: list[bool] = []
    both_arrived = asyncio.Event()

    async def handle(should_ack: bool) -> None:
        if should_ack:
            authorize_durable_ack()
        arrived.append(should_ack)
        if len(arrived) == 2:
            both_arrived.set()
        await both_arrived.wait()

    task = broker.register_task(handle, task_name=f"evidence:concurrent-ack:{uuid4().hex}:v1")

    try:
        await redis.delete(stream)
        await broker.startup()
        await task.kiq(True)
        await task.kiq(False)
        await _run_durable_receiver(broker, task_count=2)

        pending = await redis.xpending_range(stream, broker.consumer_group_name, "-", "+", 10)
        assert sorted(arrived) == [False, True]
        assert len(pending) == 1
        pending_entries = await redis.xrange(stream, min=pending[0]["message_id"], max=pending[0]["message_id"])
        pending_message = broker.formatter.loads(pending_entries[0][1][b"data"])
        assert pending_message.args == [False]
    finally:
        both_arrived.set()
        await broker.shutdown()
        await redis.delete(stream)
        await redis.aclose()
