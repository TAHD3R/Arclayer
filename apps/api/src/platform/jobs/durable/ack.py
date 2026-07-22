from __future__ import annotations

from collections.abc import AsyncGenerator, Callable, Iterator
from concurrent.futures import Executor
from contextlib import contextmanager
from contextvars import ContextVar
from enum import StrEnum

from taskiq import AckableMessage
from taskiq.abc.broker import AsyncBroker
from taskiq.acks import AcknowledgeType
from taskiq.receiver import Receiver
from taskiq.utils import maybe_awaitable
from taskiq_redis import RedisStreamBroker


class DurableAckDecision(StrEnum):
    """Transport acknowledgement decision for the current Receiver callback."""

    DEFER = "defer"
    ACK = "ack"


class DurableAckScopeError(RuntimeError):
    """Raised when code authorizes acknowledgement outside a delivery callback."""


class DurableAckGateConfigurationError(RuntimeError):
    """Raised when a durable worker bypasses the locked acknowledgement contract."""


_DURABLE_ACK_DECISION: ContextVar[DurableAckDecision] = ContextVar(
    "durable_ack_decision",
    default=DurableAckDecision.DEFER,
)
_DURABLE_ACK_SCOPE_ACTIVE: ContextVar[bool] = ContextVar(
    "durable_ack_scope_active",
    default=False,
)


@contextmanager
def durable_ack_callback_scope() -> Iterator[None]:
    """Isolate one callback's default-DEFER decision and reset it on every exit."""

    decision_token = _DURABLE_ACK_DECISION.set(DurableAckDecision.DEFER)
    active_token = _DURABLE_ACK_SCOPE_ACTIVE.set(True)
    try:
        yield
    finally:
        _DURABLE_ACK_SCOPE_ACTIVE.reset(active_token)
        _DURABLE_ACK_DECISION.reset(decision_token)


def authorize_durable_ack() -> None:
    """Authorize XACK from a registered async handler after its durable outcome is safe."""

    if not _DURABLE_ACK_SCOPE_ACTIVE.get():
        raise DurableAckScopeError("ACK authorization requires an active durable callback scope")
    _DURABLE_ACK_DECISION.set(DurableAckDecision.ACK)


def gated_ackable_message(message: AckableMessage) -> AckableMessage:
    """Wrap the locked Taskiq message so only explicit authorization reaches XACK."""

    async def acknowledge_if_authorized() -> None:
        if _DURABLE_ACK_DECISION.get() is DurableAckDecision.DEFER:
            return
        await maybe_awaitable(message.ack())

    return AckableMessage(data=message.data, ack=acknowledge_if_authorized)


class DurableRedisStreamBroker(RedisStreamBroker):
    """Locked Redis Stream broker with application-owned acknowledgement gating."""

    async def listen(self) -> AsyncGenerator[AckableMessage, None]:
        async for message in super().listen():
            yield gated_ackable_message(message)


def validate_durable_ack_type(
    ack_type: AcknowledgeType | str | None,
) -> AcknowledgeType:
    """Normalize and enforce the only acknowledgement timing proven by the ADR."""

    try:
        normalized = AcknowledgeType(AcknowledgeType.WHEN_SAVED if ack_type is None else ack_type)
    except ValueError as exc:
        raise DurableAckGateConfigurationError(f"unknown Taskiq acknowledgement mode {ack_type!r}") from exc
    if normalized is not AcknowledgeType.WHEN_SAVED:
        raise DurableAckGateConfigurationError(
            f"durable Taskiq workers require ack_type='when_saved'; received {normalized.value!r}"
        )
    return normalized


class DurableAckReceiver(Receiver):
    """Taskiq Receiver that gives every callback an isolated default-DEFER gate."""

    def __init__(
        self,
        broker: AsyncBroker,
        executor: Executor | None = None,
        validate_params: bool = True,
        max_async_tasks: int | None = None,
        max_prefetch: int = 0,
        propagate_exceptions: bool = True,
        run_startup: bool = True,
        ack_type: AcknowledgeType | str | None = None,
        on_exit: Callable[[Receiver], None] | None = None,
        max_tasks_to_execute: int | None = None,
        wait_tasks_timeout: float | None = None,
    ) -> None:
        if not isinstance(broker, DurableRedisStreamBroker):
            raise DurableAckGateConfigurationError(
                "DurableAckReceiver requires DurableRedisStreamBroker so Taskiq cannot bypass the ACK gate"
            )
        super().__init__(
            broker=broker,
            executor=executor,
            validate_params=validate_params,
            max_async_tasks=max_async_tasks,
            max_prefetch=max_prefetch,
            propagate_exceptions=propagate_exceptions,
            run_startup=run_startup,
            ack_type=validate_durable_ack_type(ack_type),
            on_exit=on_exit,
            max_tasks_to_execute=max_tasks_to_execute,
            wait_tasks_timeout=wait_tasks_timeout,
        )

    async def callback(
        self,
        message: bytes | AckableMessage,
        raise_err: bool = False,
    ) -> None:
        with durable_ack_callback_scope():
            await super().callback(message=message, raise_err=raise_err)
