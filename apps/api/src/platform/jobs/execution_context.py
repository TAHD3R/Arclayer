from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from hashlib import sha256
from uuid import UUID

from src.common.schemas import BaseSchema
from src.modules.jobs.execution_errors import (
    JobExecutionCancellationRequestedError,
    JobExecutionLeaseLostError,
)
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.execution_schema import JobExecutionControlSnapshot, JobExecutionLease, JobProgressUpdate
from src.modules.jobs.execution_service import BackgroundJobExecutionService


class _ExecutionControlLatch:
    __slots__ = ("cancellation", "lease_lost", "lock")

    def __init__(self) -> None:
        self.cancellation: JobExecutionControlSnapshot | None = None
        self.lease_lost: JobExecutionLeaseLostError | None = None
        self.lock = asyncio.Lock()

    def observe(self, control: JobExecutionControlSnapshot) -> None:
        if self.cancellation is None and control.cancellation_requested:
            self.cancellation = control


class FencedJobExecutionContext(JobExecutionContext[BaseSchema, BaseSchema]):
    """Immutable handler view over fenced progress, heartbeat, and identity services."""

    __slots__ = (
        "_execution",
        "_actor_user_id",
        "_control_latch",
        "_idempotency_namespace",
        "_input_reference",
        "_lease",
        "_raise_on_cancellation",
        "_request_fingerprint",
        "_source_revision",
        "_target",
    )

    def __init__(
        self,
        *,
        execution: BackgroundJobExecutionService,
        idempotency_namespace: str,
        lease: JobExecutionLease,
        target: BaseSchema,
        input_reference: BaseSchema,
        actor_user_id: UUID | None = None,
        source_revision: str | None,
        request_fingerprint: str,
        raise_on_cancellation: bool,
        control_latch: _ExecutionControlLatch | None = None,
    ) -> None:
        self._execution = execution
        self._actor_user_id = actor_user_id
        self._control_latch = control_latch or _ExecutionControlLatch()
        self._idempotency_namespace = idempotency_namespace
        self._lease = lease
        self._target = target
        self._input_reference = input_reference
        self._source_revision = source_revision
        self._request_fingerprint = request_fingerprint
        self._raise_on_cancellation = raise_on_cancellation

    @property
    def lease(self) -> JobExecutionLease:
        return self._lease

    @property
    def target(self) -> BaseSchema:
        return self._target

    @property
    def input_reference(self) -> BaseSchema:
        return self._input_reference

    @property
    def actor_user_id(self) -> UUID | None:
        return self._actor_user_id

    @property
    def source_revision(self) -> str | None:
        return self._source_revision

    @property
    def request_fingerprint(self) -> str:
        return self._request_fingerprint

    def idempotency_key(self, *, step: str) -> str:
        normalized_step = step.strip()
        if not normalized_step:
            raise ValueError("step must contain non-whitespace characters")
        payload = f"{self._idempotency_namespace}\0{self._lease.job_id}\0{normalized_step}"
        return sha256(payload.encode()).hexdigest()

    async def checkpoint(self) -> JobExecutionControlSnapshot:
        return await self._refresh_control(progress=None, propagate_cancellation=True)

    async def heartbeat(self) -> JobExecutionControlSnapshot:
        """Renew the Attempt lease without turning a cancellation request into task cancellation."""

        return await self._refresh_control(progress=None, propagate_cancellation=False)

    async def report_progress(self, update: JobProgressUpdate) -> JobExecutionControlSnapshot:
        return await self._refresh_control(progress=update, propagate_cancellation=True)

    async def run_fenced_domain_commit[ResultT](
        self,
        operation: Callable[[], Awaitable[ResultT]],
    ) -> ResultT:
        async with self._control_latch.lock:
            self._raise_latched_control(propagate_cancellation=True)
            try:
                result, control = await self._execution.run_fenced_domain_commit(
                    lease=self._lease,
                    operation=operation,
                )
            except JobExecutionLeaseLostError as error:
                self._control_latch.lease_lost = error
                raise
            self._control_latch.observe(control)
            self._raise_latched_control(propagate_cancellation=True)
            return result

    def with_cancellation_signals(self, *, enabled: bool) -> FencedJobExecutionContext:
        return FencedJobExecutionContext(
            execution=self._execution,
            idempotency_namespace=self._idempotency_namespace,
            lease=self._lease,
            target=self._target,
            input_reference=self._input_reference,
            actor_user_id=self._actor_user_id,
            source_revision=self._source_revision,
            request_fingerprint=self._request_fingerprint,
            raise_on_cancellation=enabled,
            control_latch=self._control_latch,
        )

    async def _refresh_control(
        self,
        *,
        progress: JobProgressUpdate | None,
        propagate_cancellation: bool,
    ) -> JobExecutionControlSnapshot:
        async with self._control_latch.lock:
            self._raise_latched_control(propagate_cancellation=propagate_cancellation)
            try:
                control = await self._execution.checkpoint_execution(
                    lease=self._lease,
                    progress=progress,
                )
            except JobExecutionLeaseLostError as error:
                self._control_latch.lease_lost = error
                raise
            self._control_latch.observe(control)
            self._raise_latched_control(propagate_cancellation=propagate_cancellation)
            return control

    def _raise_latched_control(self, *, propagate_cancellation: bool) -> None:
        if self._control_latch.lease_lost is not None:
            raise self._control_latch.lease_lost
        if propagate_cancellation and self._raise_on_cancellation and self._control_latch.cancellation is not None:
            raise JobExecutionCancellationRequestedError(
                control=self._control_latch.cancellation,
            )
