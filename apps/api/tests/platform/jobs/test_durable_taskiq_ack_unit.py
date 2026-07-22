from __future__ import annotations

import asyncio

import pytest
from taskiq import AckableMessage
from taskiq.acks import AcknowledgeType
from taskiq.utils import maybe_awaitable
from taskiq_redis import RedisStreamBroker

from src.platform.jobs.durable.ack import (
    DurableAckGateConfigurationError,
    DurableAckReceiver,
    DurableAckScopeError,
    DurableRedisStreamBroker,
    authorize_durable_ack,
    durable_ack_callback_scope,
    gated_ackable_message,
    validate_durable_ack_type,
)

pytestmark = pytest.mark.unit

_REDIS_DSN = "redis://127.0.0.1:6379/15"


def _ackable(label: str, acknowledged: list[str]) -> AckableMessage:
    async def acknowledge() -> None:
        acknowledged.append(label)

    return gated_ackable_message(AckableMessage(data=label.encode(), ack=acknowledge))


@pytest.mark.asyncio
async def test_ack_gate_defaults_to_defer_and_authorize_requires_active_callback_scope() -> None:
    acknowledged: list[str] = []
    message = _ackable("delivery", acknowledged)

    await maybe_awaitable(message.ack())

    assert acknowledged == []
    with pytest.raises(DurableAckScopeError, match="active durable callback scope"):
        authorize_durable_ack()


@pytest.mark.asyncio
async def test_ack_gate_authorizes_only_the_active_callback_and_resets_in_finally() -> None:
    acknowledged: list[str] = []
    message = _ackable("delivery", acknowledged)

    with pytest.raises(RuntimeError, match="after authorization"):
        with durable_ack_callback_scope():
            authorize_durable_ack()
            await maybe_awaitable(message.ack())
            raise RuntimeError("after authorization")

    await maybe_awaitable(message.ack())

    assert acknowledged == ["delivery"]


@pytest.mark.asyncio
async def test_concurrent_callback_scopes_do_not_share_ack_authorization() -> None:
    acknowledged: list[str] = []
    authorized_message = _ackable("authorized", acknowledged)
    deferred_message = _ackable("deferred", acknowledged)
    authorized_ready = asyncio.Event()
    deferred_ready = asyncio.Event()
    release = asyncio.Event()

    async def run_authorized_callback() -> None:
        with durable_ack_callback_scope():
            authorize_durable_ack()
            authorized_ready.set()
            await release.wait()
            await maybe_awaitable(authorized_message.ack())

    async def run_deferred_callback() -> None:
        with durable_ack_callback_scope():
            deferred_ready.set()
            await release.wait()
            await maybe_awaitable(deferred_message.ack())

    callbacks = [
        asyncio.create_task(run_authorized_callback()),
        asyncio.create_task(run_deferred_callback()),
    ]
    await asyncio.gather(authorized_ready.wait(), deferred_ready.wait())
    release.set()
    await asyncio.gather(*callbacks)

    assert acknowledged == ["authorized"]


def test_durable_receiver_requires_gated_broker_and_when_saved_acknowledgement() -> None:
    plain_broker = RedisStreamBroker(_REDIS_DSN, queue_name="plain")
    durable_broker = DurableRedisStreamBroker(_REDIS_DSN, queue_name="durable")

    with pytest.raises(DurableAckGateConfigurationError, match="DurableRedisStreamBroker"):
        DurableAckReceiver(plain_broker, run_startup=False)

    for ack_type in (AcknowledgeType.WHEN_RECEIVED, AcknowledgeType.WHEN_EXECUTED):
        with pytest.raises(DurableAckGateConfigurationError, match="when_saved"):
            DurableAckReceiver(durable_broker, run_startup=False, ack_type=ack_type)

    receiver = DurableAckReceiver(
        durable_broker,
        run_startup=False,
        ack_type=AcknowledgeType.WHEN_SAVED,
    )

    assert receiver.ack_time is AcknowledgeType.WHEN_SAVED


def test_ack_type_validator_does_not_silently_default_invalid_text() -> None:
    with pytest.raises(DurableAckGateConfigurationError, match="unknown Taskiq acknowledgement mode"):
        validate_durable_ack_type("")
