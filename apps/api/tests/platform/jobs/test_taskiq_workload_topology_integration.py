from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from typing import Any
from uuid import uuid4

import pytest
from redis.asyncio import Redis
from taskiq.receiver import Receiver
from taskiq.utils import maybe_awaitable
from taskiq_redis import RedisStreamBroker

from src.config import get_settings
from src.models.jobs.background_job import JobWorkloadClass

pytestmark = pytest.mark.integration

_READ_BLOCK_MS = 25
_AUTOCLAIM_IDLE_MS = 10
_WAIT_SECONDS = 3


def _stream_name(prefix: str, token: str, workload_class: JobWorkloadClass) -> str:
    return f"{prefix}:taskiq-topology:{token}:{workload_class.value}"


def _broker(
    *,
    dsn: str,
    stream: str,
    group: str,
    consumer: str,
) -> RedisStreamBroker:
    return RedisStreamBroker(
        url=dsn,
        queue_name=stream,
        consumer_group_name=group,
        consumer_name=consumer,
        consumer_id="0-0",
        xread_block=_READ_BLOCK_MS,
        xread_count=1,
        idle_timeout=_AUTOCLAIM_IDLE_MS,
        unacknowledged_batch_size=1,
        unacknowledged_lock_timeout=1,
    )


async def _run_receiver_once(broker: RedisStreamBroker) -> None:
    receiver = Receiver(
        broker,
        run_startup=False,
        max_async_tasks=1,
        max_prefetch=1,
        max_tasks_to_execute=1,
        wait_tasks_timeout=1,
    )
    await asyncio.wait_for(receiver.listen(asyncio.Event()), timeout=_WAIT_SECONDS)


async def _close_iterator(iterator: AsyncGenerator[Any, None]) -> None:
    await iterator.aclose()


@pytest.mark.asyncio
async def test_distinct_stream_brokers_route_and_selectively_consume_real_valkey(
    integration_valkey_settings: str,
) -> None:
    settings = get_settings()
    token = uuid4().hex
    group = f"topology-{token}"
    agent_stream = _stream_name(integration_valkey_settings, token, JobWorkloadClass.AGENT_IO)
    render_stream = _stream_name(integration_valkey_settings, token, JobWorkloadClass.RENDER_BROWSER)
    agent_broker = _broker(
        dsn=settings.valkey.dsn,
        stream=agent_stream,
        group=group,
        consumer="agent-worker",
    )
    render_broker = _broker(
        dsn=settings.valkey.dsn,
        stream=render_stream,
        group=group,
        consumer="render-worker",
    )
    redis = Redis.from_url(settings.valkey.dsn)
    executed: list[tuple[str, str]] = []

    async def execute_agent(value: str) -> None:
        executed.append((JobWorkloadClass.AGENT_IO.value, value))

    async def execute_render(value: str) -> None:
        executed.append((JobWorkloadClass.RENDER_BROWSER.value, value))

    agent_task = agent_broker.register_task(
        execute_agent,
        task_name="evidence:agent-io:v1",
    )
    render_task = render_broker.register_task(
        execute_render,
        task_name="evidence:render-browser:v1",
    )
    producers = {
        JobWorkloadClass.AGENT_IO: agent_task,
        JobWorkloadClass.RENDER_BROWSER: render_task,
    }

    try:
        await redis.delete(agent_stream, render_stream)
        await agent_broker.startup()
        await render_broker.startup()

        await producers[JobWorkloadClass.AGENT_IO].kiq("agent-job")
        await producers[JobWorkloadClass.RENDER_BROWSER].kiq("render-job")

        assert await redis.xlen(agent_stream) == 1
        assert await redis.xlen(render_stream) == 1

        await _run_receiver_once(agent_broker)

        assert executed == [(JobWorkloadClass.AGENT_IO.value, "agent-job")]
        assert await redis.xpending_range(agent_stream, group, "-", "+", 10) == []
        assert await redis.xpending_range(render_stream, group, "-", "+", 10) == []

        await _run_receiver_once(render_broker)

        assert executed == [
            (JobWorkloadClass.AGENT_IO.value, "agent-job"),
            (JobWorkloadClass.RENDER_BROWSER.value, "render-job"),
        ]
        assert await redis.xpending_range(render_stream, group, "-", "+", 10) == []
    finally:
        await agent_broker.shutdown()
        await render_broker.shutdown()
        await redis.delete(agent_stream, render_stream)
        await redis.aclose()


def test_taskiq_local_registry_silently_overwrites_same_name_and_is_broker_local() -> None:
    first_broker = RedisStreamBroker("redis://127.0.0.1:6379/15", queue_name="registry-a")
    second_broker = RedisStreamBroker("redis://127.0.0.1:6379/15", queue_name="registry-b")
    first_handler = lambda: "first"
    replacement_handler = lambda: "replacement"
    second_broker_handler = lambda: "second-broker"

    first_task = first_broker.register_task(first_handler, task_name="evidence:duplicate:v1")
    replacement_task = first_broker.register_task(replacement_handler, task_name="evidence:duplicate:v1")
    other_task = second_broker.register_task(second_broker_handler, task_name="evidence:duplicate:v1")

    assert first_broker.find_task("evidence:duplicate:v1") is replacement_task
    assert first_broker.find_task("evidence:duplicate:v1") is not first_task
    assert second_broker.find_task("evidence:duplicate:v1") is other_task
    assert first_broker.find_task("evidence:duplicate:v1") is not second_broker.find_task("evidence:duplicate:v1")


@pytest.mark.asyncio
async def test_freeform_queue_label_can_misroute_unregistered_task_and_leave_it_pending(
    integration_valkey_settings: str,
) -> None:
    settings = get_settings()
    token = uuid4().hex
    group = f"topology-{token}"
    agent_stream = _stream_name(integration_valkey_settings, token, JobWorkloadClass.AGENT_IO)
    render_stream = _stream_name(integration_valkey_settings, token, JobWorkloadClass.RENDER_BROWSER)
    agent_broker = _broker(
        dsn=settings.valkey.dsn,
        stream=agent_stream,
        group=group,
        consumer="agent-producer",
    )
    render_broker = _broker(
        dsn=settings.valkey.dsn,
        stream=render_stream,
        group=group,
        consumer="render-worker",
    )
    redis = Redis.from_url(settings.valkey.dsn)
    executed: list[str] = []

    async def execute_agent(value: str) -> None:
        executed.append(value)

    agent_task = agent_broker.register_task(execute_agent, task_name="evidence:misroute:v1")

    try:
        await redis.delete(agent_stream, render_stream)
        await agent_broker.startup()
        await render_broker.startup()

        await agent_task.kicker().with_labels(queue_name=render_stream).kiq("wrong-stream")

        assert await redis.xlen(agent_stream) == 0
        assert await redis.xlen(render_stream) == 1

        await _run_receiver_once(render_broker)

        assert executed == []
        assert len(await redis.xpending_range(render_stream, group, "-", "+", 10)) == 1
    finally:
        await agent_broker.shutdown()
        await render_broker.shutdown()
        await redis.delete(agent_stream, render_stream)
        await redis.aclose()


@pytest.mark.asyncio
async def test_unacknowledged_message_is_autoclaimed_then_ack_clears_pending(
    integration_valkey_settings: str,
) -> None:
    settings = get_settings()
    token = uuid4().hex
    stream = _stream_name(integration_valkey_settings, token, JobWorkloadClass.MAINTENANCE)
    group = f"topology-{token}"
    first_broker = _broker(
        dsn=settings.valkey.dsn,
        stream=stream,
        group=group,
        consumer="worker-a",
    )
    second_broker = _broker(
        dsn=settings.valkey.dsn,
        stream=stream,
        group=group,
        consumer="worker-b",
    )
    redis = Redis.from_url(settings.valkey.dsn)
    task = first_broker.register_task(lambda value: value, task_name="evidence:redelivery:v1")
    first_iterator: AsyncGenerator[Any, None] | None = None
    second_iterator: AsyncGenerator[Any, None] | None = None

    try:
        await redis.delete(stream)
        await first_broker.startup()
        await task.kiq("redeliver-me")

        first_iterator = first_broker.listen()
        first_message = await asyncio.wait_for(anext(first_iterator), timeout=_WAIT_SECONDS)
        first_taskiq_message = first_broker.formatter.loads(first_message.data)

        assert len(await redis.xpending_range(stream, group, "-", "+", 10)) == 1

        await _close_iterator(first_iterator)
        first_iterator = None
        await first_broker.shutdown()
        await asyncio.sleep((_AUTOCLAIM_IDLE_MS / 1000) + 0.02)

        await second_broker.startup()
        second_iterator = second_broker.listen()
        second_message = await asyncio.wait_for(anext(second_iterator), timeout=_WAIT_SECONDS)
        second_taskiq_message = second_broker.formatter.loads(second_message.data)

        assert second_taskiq_message.task_id == first_taskiq_message.task_id
        assert second_taskiq_message.task_name == first_taskiq_message.task_name
        assert len(await redis.xpending_range(stream, group, "-", "+", 10)) == 1

        await maybe_awaitable(second_message.ack())

        assert await redis.xpending_range(stream, group, "-", "+", 10) == []
    finally:
        if first_iterator is not None:
            await _close_iterator(first_iterator)
        if second_iterator is not None:
            await _close_iterator(second_iterator)
        await first_broker.shutdown()
        await second_broker.shutdown()
        await redis.delete(stream)
        await redis.aclose()


@pytest.mark.asyncio
async def test_receiver_finish_event_waits_for_running_task_before_shutdown(
    integration_valkey_settings: str,
) -> None:
    settings = get_settings()
    token = uuid4().hex
    stream = _stream_name(integration_valkey_settings, token, JobWorkloadClass.PUBLISH)
    group = f"topology-{token}"
    broker = _broker(
        dsn=settings.valkey.dsn,
        stream=stream,
        group=group,
        consumer="publish-worker",
    )
    redis = Redis.from_url(settings.valkey.dsn)
    started = asyncio.Event()
    release = asyncio.Event()
    completed = asyncio.Event()

    async def execute_publish() -> None:
        started.set()
        await release.wait()
        completed.set()

    task = broker.register_task(execute_publish, task_name="evidence:publish-shutdown:v1")
    finish = asyncio.Event()
    receiver = Receiver(
        broker,
        run_startup=False,
        max_async_tasks=1,
        max_prefetch=1,
        wait_tasks_timeout=1,
    )
    receiver_task: asyncio.Task[None] | None = None

    try:
        await redis.delete(stream)
        await broker.startup()
        receiver_task = asyncio.create_task(receiver.listen(finish))
        await task.kiq()
        await asyncio.wait_for(started.wait(), timeout=_WAIT_SECONDS)

        finish.set()
        release.set()
        await asyncio.wait_for(receiver_task, timeout=_WAIT_SECONDS)

        assert completed.is_set()
        assert await redis.xpending_range(stream, group, "-", "+", 10) == []
    finally:
        release.set()
        finish.set()
        if receiver_task is not None and not receiver_task.done():
            receiver_task.cancel()
            await asyncio.gather(receiver_task, return_exceptions=True)
        await broker.shutdown()
        await redis.delete(stream)
        await redis.aclose()
