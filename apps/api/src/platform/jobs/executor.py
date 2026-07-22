from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, Protocol, cast
from uuid import UUID

from src.common.schemas import BaseSchema
from src.core.logging import get_logger
from src.modules.jobs.execution_errors import (
    JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
    JobExecutionCancellationRequestedError,
    JobExecutionLeaseLostError,
    JobExecutionOutcomeInvariantError,
    JobExecutionResultContractError,
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
)
from src.modules.jobs.execution_registry import (
    CancellableDurableJobHandler,
    DurableJobHandler,
    FailureProjectingDurableJobHandler,
    JobExecutionRegistry,
    JobHandledFailure,
    JobHandledInterruption,
    JobTypeRegistration,
)
from src.modules.jobs.execution_schema import (
    DurableJobExecutionOutcome,
    JobDeliveryClaim,
    JobDeliveryCommand,
    JobDeliveryDisposition,
    JobExecutionBinding,
    JobExecutionControlSnapshot,
    JobExecutionLease,
    JobExecutionPreparation,
    JobExecutionTerminalOutcome,
    JobSuccessCancellationDisposition,
    SystemExecutionBinding,
    TenantExecutionBinding,
)
from src.modules.jobs.execution_service import BackgroundJobExecutionService
from src.modules.jobs.execution_terminal_service import BackgroundJobTerminalService
from src.modules.jobs.execution_terminal_state import (
    JobExecutionTerminalInvariantError,
    TerminalExecutionError,
)
from src.modules.jobs.reaper_schema import JobLeaseReapOutcome
from src.modules.jobs.registry import JobTargetScope, JobTypeDefinition, JobTypeRegistry
from src.modules.tenancy.router_helpers import job_tenant_scope
from src.platform.jobs.execution_context import FencedJobExecutionContext

logger = get_logger(__name__)

_SAFE_NON_EXECUTING_DISPOSITIONS = frozenset({
    JobDeliveryDisposition.TERMINAL_DUPLICATE,
    JobDeliveryDisposition.ACTIVE_ATTEMPT_DUPLICATE,
    JobDeliveryDisposition.CANCELLED_BEFORE_ATTEMPT,
    JobDeliveryDisposition.STALE_DELIVERY,
})
_TERMINAL_EXECUTION_ERROR_TYPES = (
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
)

type JobHeartbeatWaiter = Callable[[asyncio.Event, float], Awaitable[bool]]


class _JobHeartbeatUnavailableError(RuntimeError):
    """Execution authority cannot be proven because the keepalive path failed."""

    def __init__(self) -> None:
        super().__init__("Durable Job heartbeat failed before execution authority could be confirmed")


class ExactJobLeaseReaper(Protocol):
    async def reap_exact(self, *, job_id: UUID, attempt_id: UUID) -> JobLeaseReapOutcome: ...


class JobExecutionBoundary(Protocol):
    async def resolve_for_reconciliation(
        self,
        *,
        preparation: JobExecutionPreparation,
        definition: JobTypeDefinition,
        target: BaseSchema,
        input_reference: BaseSchema,
    ) -> JobExecutionBinding: ...

    async def authorize_new_effect(
        self,
        *,
        preparation: JobExecutionPreparation,
        definition: JobTypeDefinition,
        binding: JobExecutionBinding,
        target: BaseSchema,
        input_reference: BaseSchema,
    ) -> None: ...


class DurableJobExecutor:
    """The only reconcile-first orchestration path for durable handler execution."""

    def __init__(
        self,
        *,
        execution: BackgroundJobExecutionService,
        terminal: BackgroundJobTerminalService,
        lease_reaper: ExactJobLeaseReaper,
        job_types: JobTypeRegistry,
        handlers: JobExecutionRegistry,
        boundary: JobExecutionBoundary,
        heartbeat_waiter: JobHeartbeatWaiter | None = None,
    ) -> None:
        self.execution = execution
        self.terminal = terminal
        self.lease_reaper = lease_reaper
        self.job_types = job_types
        self.handlers = handlers
        self.boundary = boundary
        self.heartbeat_waiter = heartbeat_waiter or _wait_for_heartbeat

    async def execute_delivery(self, *, command: JobDeliveryCommand) -> DurableJobExecutionOutcome:
        delivery = await self.execution.accept_delivery(command)
        disposition = JobDeliveryDisposition(delivery.disposition)
        if disposition in _SAFE_NON_EXECUTING_DISPOSITIONS:
            return DurableJobExecutionOutcome(delivery=delivery)
        if disposition == JobDeliveryDisposition.LEASE_REAP_REQUIRED:
            return await self._reap_expired_delivery(delivery)
        if disposition != JobDeliveryDisposition.CLAIMED or delivery.lease is None:
            raise JobExecutionOutcomeInvariantError("delivery disposition did not grant executable authority")
        terminal = await self._execute_claimed(lease=delivery.lease)
        return DurableJobExecutionOutcome(delivery=delivery, terminal=terminal)

    async def _execute_claimed(
        self,
        *,
        lease: JobExecutionLease,
    ) -> JobExecutionTerminalOutcome:
        preparation = await self.execution.prepare_execution(lease=lease)
        definition = self.job_types.require(
            job_type=lease.job_type,
            job_type_version=lease.job_type_version,
        )
        registration = self.handlers.require(
            job_type=lease.job_type,
            job_type_version=lease.job_type_version,
        )
        try:
            target, input_reference = _validate_execution_contracts(
                preparation=preparation,
                definition=definition,
                registration=registration,
            )
        except PermanentJobExecutionError as error:
            return await self._project_failure_with_replay(lease=lease, error=error)

        handler = self.handlers.create_handler(
            job_type=lease.job_type,
            job_type_version=lease.job_type_version,
        )
        base_context = FencedJobExecutionContext(
            execution=self.execution,
            idempotency_namespace=definition.idempotency_namespace,
            lease=lease,
            target=target,
            input_reference=input_reference,
            actor_user_id=preparation.actor_user_id,
            source_revision=preparation.source_revision,
            request_fingerprint=preparation.request_fingerprint,
            raise_on_cancellation=False,
        )
        try:
            binding, boundary_control = await self._run_with_heartbeat_evidence(
                operation=self.boundary.resolve_for_reconciliation(
                    preparation=preparation,
                    definition=definition,
                    target=target,
                    input_reference=input_reference,
                ),
                context=base_context,
                heartbeat_seconds=definition.heartbeat_seconds,
            )
            _validate_execution_binding(definition=definition, binding=binding)
        except _TERMINAL_EXECUTION_ERROR_TYPES as error:
            return await self._project_failure_with_replay(lease=lease, error=error)

        if isinstance(binding, TenantExecutionBinding):
            with job_tenant_scope(binding.tenant_context):
                return await self._run_handler(
                    handler=handler,
                    context=base_context,
                    preparation=preparation,
                    definition=definition,
                    binding=binding,
                    latest_control=boundary_control,
                )
        if not isinstance(binding, SystemExecutionBinding):
            raise JobExecutionOutcomeInvariantError("execution boundary returned an unknown binding")
        return await self._run_handler(
            handler=handler,
            context=base_context,
            preparation=preparation,
            definition=definition,
            binding=binding,
            latest_control=boundary_control,
        )

    async def _run_handler(
        self,
        *,
        handler: DurableJobHandler[Any, Any, Any],
        context: FencedJobExecutionContext,
        preparation: JobExecutionPreparation,
        definition: JobTypeDefinition,
        binding: JobExecutionBinding,
        latest_control: JobExecutionControlSnapshot | None,
    ) -> JobExecutionTerminalOutcome:
        try:
            canonical, reconcile_control = await self._run_with_heartbeat_evidence(
                operation=handler.reconcile(context=context),
                context=context,
                heartbeat_seconds=definition.heartbeat_seconds,
            )
        except _TERMINAL_EXECUTION_ERROR_TYPES as error:
            return await self._project_failure_with_replay(lease=context.lease, error=error)
        if canonical is not None:
            return await self._project_reconciled_outcome(
                handler=handler,
                context=context,
                outcome=_require_typed_result(canonical),
                heartbeat_seconds=definition.heartbeat_seconds,
            )
        if _cancellation_observed(
            preparation.control,
            latest_control,
            reconcile_control,
        ):
            return await self._cancel_and_ack(
                handler=handler,
                context=context,
                heartbeat_seconds=definition.heartbeat_seconds,
            )

        execution_context = context.with_cancellation_signals(enabled=True)
        try:
            await self._run_with_heartbeats(
                operation=self.boundary.authorize_new_effect(
                    preparation=preparation,
                    definition=definition,
                    binding=binding,
                    target=context.target,
                    input_reference=context.input_reference,
                ),
                context=execution_context,
                heartbeat_seconds=definition.heartbeat_seconds,
                propagate_cancellation=True,
            )
        except JobExecutionCancellationRequestedError:
            return await self._reconcile_then_cancel(
                handler=handler,
                context=context,
                heartbeat_seconds=definition.heartbeat_seconds,
            )
        except _TERMINAL_EXECUTION_ERROR_TYPES as error:
            return await self._reconcile_then_fail(
                handler=handler,
                context=context,
                error=error,
                heartbeat_seconds=definition.heartbeat_seconds,
            )

        try:
            await execution_context.checkpoint()
            result = await self._run_with_heartbeats(
                operation=handler.execute(context=execution_context),
                context=execution_context,
                heartbeat_seconds=definition.heartbeat_seconds,
                propagate_cancellation=True,
            )
        except JobExecutionLeaseLostError:
            raise
        except _JobHeartbeatUnavailableError:
            raise
        except JobExecutionCancellationRequestedError:
            return await self._reconcile_then_cancel(
                handler=handler,
                context=context,
                heartbeat_seconds=definition.heartbeat_seconds,
            )
        except _TERMINAL_EXECUTION_ERROR_TYPES as error:
            return await self._reconcile_then_fail(
                handler=handler,
                context=context,
                error=error,
                heartbeat_seconds=definition.heartbeat_seconds,
            )
        except Exception:
            logger.exception(
                "Unexpected durable Job handler failure",
                job_id=str(context.lease.job_id),
                attempt_id=str(context.lease.attempt_id),
                job_type=context.lease.job_type,
                correlation_id=preparation.correlation_id,
            )
            error = UnexpectedJobExecutionError(
                handler=context.lease.job_type,
                correlation_id=preparation.correlation_id,
            )
            return await self._reconcile_then_fail(
                handler=handler,
                context=context,
                error=error,
                heartbeat_seconds=definition.heartbeat_seconds,
            )
        return await self._project_reconciled_outcome(
            handler=handler,
            context=context,
            outcome=_require_typed_result(result),
            heartbeat_seconds=definition.heartbeat_seconds,
        )

    async def _project_reconciled_outcome(
        self,
        *,
        handler: DurableJobHandler[Any, Any, Any],
        context: FencedJobExecutionContext,
        outcome: BaseSchema,
        heartbeat_seconds: int,
    ) -> JobExecutionTerminalOutcome:
        if isinstance(outcome, JobHandledFailure):
            return await self._project_failure_with_replay(
                lease=context.lease,
                error=_handled_failure_error(outcome),
            )
        if isinstance(outcome, JobHandledInterruption):
            return await _retry_ambiguous_projection(
                lambda: self.terminal.interrupt_for_user(
                    lease=context.lease,
                    interruption=outcome,
                )
            )
        return await self._project_success_with_reconciliation(
            handler=handler,
            context=context,
            result=outcome,
            heartbeat_seconds=heartbeat_seconds,
        )

    async def _run_with_heartbeats[ResultT](
        self,
        *,
        operation: Awaitable[ResultT],
        context: FencedJobExecutionContext,
        heartbeat_seconds: int,
        propagate_cancellation: bool,
    ) -> ResultT:
        result, latest_control = await self._run_with_heartbeat_evidence(
            operation=operation,
            context=context,
            heartbeat_seconds=heartbeat_seconds,
        )
        if propagate_cancellation and latest_control is not None and latest_control.cancellation_requested:
            raise JobExecutionCancellationRequestedError(control=latest_control)
        return result

    async def _run_with_heartbeat_evidence[ResultT](
        self,
        *,
        operation: Awaitable[ResultT],
        context: FencedJobExecutionContext,
        heartbeat_seconds: int,
    ) -> tuple[ResultT, JobExecutionControlSnapshot | None]:
        stop = asyncio.Event()
        operation_task = asyncio.ensure_future(operation)
        keepalive = asyncio.create_task(
            self._heartbeat_until_stopped(
                context=context,
                stop=stop,
                heartbeat_seconds=heartbeat_seconds,
            )
        )
        try:
            done, _pending = await asyncio.wait(
                {operation_task, keepalive},
                return_when=asyncio.FIRST_COMPLETED,
            )
        except asyncio.CancelledError as cancellation:
            operation_task.cancel()
            operation_outcome, cancellation = await _settle_task(
                operation_task,
                cancellation=cancellation,
                label="operation shutdown",
            )
            stop.set()
            keepalive_outcome, cancellation = await _settle_task(
                keepalive,
                cancellation=cancellation,
                label="keepalive shutdown",
            )
            if cancellation is None:
                raise JobExecutionOutcomeInvariantError("cancelled execution convergence lost its primary cancellation")
            _add_secondary_error_note(
                primary=cancellation,
                secondary=operation_outcome,
                label="operation",
            )
            _add_secondary_error_note(
                primary=cancellation,
                secondary=keepalive_outcome,
                label="keepalive",
            )
            raise

        if keepalive in done:
            heartbeat_error = _active_heartbeat_error(_completed_task_outcome(keepalive))
            operation_was_done = operation_task.done()
            if not operation_was_done:
                operation_task.cancel()
            operation_outcome, delivery_cancellation = await _settle_task(
                operation_task,
                cancellation=None,
                label="operation shutdown",
            )
            if delivery_cancellation is not None:
                heartbeat_error.add_note("delivery was also cancelled while operation shutdown was settling")
            _add_secondary_error_note(
                primary=heartbeat_error,
                secondary=operation_outcome,
                label="operation" if operation_was_done else "operation shutdown",
            )
            raise heartbeat_error

        stop.set()
        operation_outcome = _completed_task_outcome(operation_task)
        keepalive_outcome, delivery_cancellation = await _settle_task(
            keepalive,
            cancellation=None,
            label="keepalive shutdown",
        )
        if delivery_cancellation is not None:
            _add_secondary_error_note(
                primary=delivery_cancellation,
                secondary=operation_outcome,
                label="operation",
            )
            _add_secondary_error_note(
                primary=delivery_cancellation,
                secondary=keepalive_outcome,
                label="keepalive",
            )
            raise delivery_cancellation
        if isinstance(keepalive_outcome, JobExecutionLeaseLostError):
            _add_secondary_error_note(
                primary=keepalive_outcome,
                secondary=operation_outcome,
                label="operation",
            )
            raise keepalive_outcome
        if isinstance(operation_outcome, BaseException):
            _add_secondary_error_note(
                primary=operation_outcome,
                secondary=keepalive_outcome,
                label="keepalive",
            )
            raise operation_outcome
        if isinstance(keepalive_outcome, BaseException):
            raise keepalive_outcome
        return cast(ResultT, operation_outcome), keepalive_outcome

    async def _heartbeat_until_stopped(
        self,
        *,
        context: FencedJobExecutionContext,
        stop: asyncio.Event,
        heartbeat_seconds: int,
    ) -> JobExecutionControlSnapshot | None:
        latest_control: JobExecutionControlSnapshot | None = None
        try:
            while not await self.heartbeat_waiter(stop, float(heartbeat_seconds)):
                async with asyncio.timeout(float(heartbeat_seconds)):
                    latest_control = await context.heartbeat()
            return latest_control
        except (asyncio.CancelledError, JobExecutionLeaseLostError):
            raise
        except Exception as error:
            raise _JobHeartbeatUnavailableError() from error

    async def _project_success_with_reconciliation(
        self,
        *,
        handler: DurableJobHandler[Any, Any, Any],
        context: FencedJobExecutionContext,
        result: BaseSchema,
        heartbeat_seconds: int,
    ) -> JobExecutionTerminalOutcome:
        try:
            return await self.terminal.complete_success(
                lease=context.lease,
                result=result,
                cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
            )
        except JobExecutionLeaseLostError:
            raise
        except JobExecutionResultContractError as error:
            return await self._project_failure_with_replay(lease=context.lease, error=error)
        except JobExecutionTerminalInvariantError:
            raise
        except Exception as first_projection_error:
            canonical = await self._reconcile_handler(
                handler=handler,
                context=context,
                heartbeat_seconds=heartbeat_seconds,
            )
            if canonical is None:
                raise JobExecutionOutcomeInvariantError(
                    "handler success has no reconcilable owning-domain outcome"
                ) from first_projection_error
            return await self._project_reconciled_outcome(
                handler=handler,
                context=context,
                outcome=_require_typed_result(canonical),
                heartbeat_seconds=heartbeat_seconds,
            )

    async def _reconcile_then_fail(
        self,
        *,
        handler: DurableJobHandler[Any, Any, Any],
        context: FencedJobExecutionContext,
        error: TerminalExecutionError,
        heartbeat_seconds: int,
    ) -> JobExecutionTerminalOutcome:
        canonical = await self._reconcile_handler(
            handler=handler,
            context=context,
            heartbeat_seconds=heartbeat_seconds,
        )
        if canonical is not None:
            return await self._project_reconciled_outcome(
                handler=handler,
                context=context,
                outcome=_require_typed_result(canonical),
                heartbeat_seconds=heartbeat_seconds,
            )
        if isinstance(handler, FailureProjectingDurableJobHandler):
            failure_handler = cast(
                FailureProjectingDurableJobHandler[Any, Any, Any],
                handler,
            )
            handled = await self._run_with_heartbeats(
                operation=failure_handler.project_failure(context=context, error=error),
                context=context,
                heartbeat_seconds=heartbeat_seconds,
                propagate_cancellation=False,
            )
            return await self._project_failure_with_replay(
                lease=context.lease,
                error=error if handled is None else _handled_failure_error(handled),
            )
        return await self._project_failure_with_replay(lease=context.lease, error=error)

    async def _reconcile_then_cancel(
        self,
        *,
        handler: DurableJobHandler[Any, Any, Any],
        context: FencedJobExecutionContext,
        heartbeat_seconds: int,
    ) -> JobExecutionTerminalOutcome:
        canonical = await self._reconcile_handler(
            handler=handler,
            context=context,
            heartbeat_seconds=heartbeat_seconds,
        )
        if canonical is not None:
            return await self._project_reconciled_outcome(
                handler=handler,
                context=context,
                outcome=_require_typed_result(canonical),
                heartbeat_seconds=heartbeat_seconds,
            )
        return await self._cancel_and_ack(
            handler=handler,
            context=context,
            heartbeat_seconds=heartbeat_seconds,
        )

    async def _reconcile_handler(
        self,
        *,
        handler: DurableJobHandler[Any, Any, Any],
        context: FencedJobExecutionContext,
        heartbeat_seconds: int,
    ) -> BaseSchema | None:
        return await self._run_with_heartbeats(
            operation=handler.reconcile(context=context),
            context=context,
            heartbeat_seconds=heartbeat_seconds,
            propagate_cancellation=False,
        )

    async def _cancel_and_ack(
        self,
        *,
        handler: DurableJobHandler[Any, Any, Any],
        context: FencedJobExecutionContext,
        heartbeat_seconds: int,
    ) -> JobExecutionTerminalOutcome:
        cancellation_handler = _require_cancellable_handler(handler)
        await self._run_with_heartbeats(
            operation=cancellation_handler.cancel(context=context),
            context=context,
            heartbeat_seconds=heartbeat_seconds,
            propagate_cancellation=False,
        )
        canonical = await self._reconcile_handler(
            handler=handler,
            context=context,
            heartbeat_seconds=heartbeat_seconds,
        )
        if canonical is not None:
            return await self._project_reconciled_outcome(
                handler=handler,
                context=context,
                outcome=_require_typed_result(canonical),
                heartbeat_seconds=heartbeat_seconds,
            )
        return await _retry_ambiguous_projection(lambda: self.terminal.acknowledge_cancellation(lease=context.lease))

    async def _project_failure_with_replay(
        self,
        *,
        lease: JobExecutionLease,
        error: TerminalExecutionError,
    ) -> JobExecutionTerminalOutcome:
        return await _retry_ambiguous_projection(lambda: self.terminal.complete_failure(lease=lease, error=error))

    async def _reap_expired_delivery(
        self,
        delivery: JobDeliveryClaim,
    ) -> DurableJobExecutionOutcome:
        if delivery.active_attempt_id is None:
            raise JobExecutionOutcomeInvariantError("expired delivery is missing its active Attempt")
        reaped = await self.lease_reaper.reap_exact(
            job_id=delivery.job_id,
            attempt_id=delivery.active_attempt_id,
        )
        return DurableJobExecutionOutcome(delivery=delivery, lease_reap=reaped)


def _validate_execution_contracts(
    *,
    preparation: JobExecutionPreparation,
    definition: JobTypeDefinition,
    registration: JobTypeRegistration,
) -> tuple[BaseSchema, BaseSchema]:
    try:
        if preparation.authority_mode != definition.authority_mode:
            raise ValueError("canonical authority mode differs from the registered Job definition")
        if preparation.phase not in definition.phases:
            raise ValueError("canonical phase is not registered for this Job definition")
        target = registration.target_schema.model_validate(preparation.target_descriptor)
        input_reference = registration.input_reference_schema.model_validate(preparation.input_reference)
        if definition.cross_field_validator is not None:
            definition.cross_field_validator(target, input_reference)
    except (TypeError, ValueError) as exc:
        raise PermanentJobExecutionError(
            code=JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
            safe_message="The durable Job target or input reference is invalid",
        ) from exc
    return target, input_reference


def _validate_execution_binding(
    *,
    definition: JobTypeDefinition,
    binding: JobExecutionBinding,
) -> None:
    target_scope = JobTargetScope(definition.target_scope)
    if target_scope == JobTargetScope.SYSTEM and isinstance(binding, SystemExecutionBinding):
        return
    if target_scope in {JobTargetScope.WORKSPACE, JobTargetScope.PROJECT} and isinstance(
        binding,
        TenantExecutionBinding,
    ):
        return
    raise PermanentJobExecutionError(
        code=JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
        safe_message="The Job execution binding does not match its registered target scope",
    )


def _cancellation_observed(
    *controls: JobExecutionControlSnapshot | None,
) -> bool:
    return any(control is not None and control.cancellation_requested for control in controls)


def _require_typed_result(result: object) -> BaseSchema:
    if not isinstance(result, BaseSchema):
        raise JobExecutionResultContractError()
    return result


def _handled_failure_error(failure: JobHandledFailure) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=failure.code,
        safe_message=failure.safe_message,
        metadata=failure.metadata,
    )


def _require_cancellable_handler(
    handler: DurableJobHandler[Any, Any, Any],
) -> CancellableDurableJobHandler[Any, Any, Any]:
    if not isinstance(handler, CancellableDurableJobHandler):
        raise JobExecutionOutcomeInvariantError(
            "cancellation reached a handler without its registered cleanup capability"
        )
    return handler


async def _retry_ambiguous_projection[ProjectionT](
    operation: Callable[[], Awaitable[ProjectionT]],
) -> ProjectionT:
    try:
        return await operation()
    except (JobExecutionLeaseLostError, JobExecutionTerminalInvariantError):
        raise
    except Exception:
        return await operation()


async def _settle_task[ResultT](
    task: asyncio.Future[ResultT],
    *,
    cancellation: asyncio.CancelledError | None,
    label: str,
) -> tuple[ResultT | BaseException, asyncio.CancelledError | None]:
    observed_cancellation = cancellation
    while not task.done():
        try:
            await asyncio.wait({task})
        except asyncio.CancelledError as repeated_cancellation:
            if observed_cancellation is None:
                observed_cancellation = repeated_cancellation
            else:
                observed_cancellation.add_note(f"{label} received another cancellation while settling")
    return _completed_task_outcome(task), observed_cancellation


def _active_heartbeat_error(outcome: object) -> BaseException:
    if isinstance(outcome, (JobExecutionLeaseLostError, _JobHeartbeatUnavailableError)):
        return outcome
    error = _JobHeartbeatUnavailableError()
    if isinstance(outcome, BaseException):
        error.__cause__ = outcome
    return error


def _completed_task_outcome[ResultT](task: asyncio.Future[ResultT]) -> ResultT | BaseException:
    try:
        return task.result()
    except BaseException as error:
        return error


def _add_secondary_error_note(
    *,
    primary: BaseException,
    secondary: object,
    label: str,
) -> None:
    if not isinstance(secondary, BaseException):
        return
    if secondary is primary or isinstance(secondary, asyncio.CancelledError):
        return
    primary.add_note(f"{label} also failed with {type(secondary).__name__}")


async def _wait_for_heartbeat(stop: asyncio.Event, interval_seconds: float) -> bool:
    try:
        await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
    except TimeoutError:
        return False
    return True
