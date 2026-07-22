from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable, Iterable, Mapping
from types import MappingProxyType
from typing import Any

from taskiq import AsyncTaskiqDecoratedTask

from src.common.types.json_types import JsonObject
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.jobs.schema import JobDispatchEnvelope
from src.platform.jobs.durable.ack import DurableRedisStreamBroker
from src.platform.jobs.durable.brokers import (
    ExactWorkloadBrokerSelector,
    validate_workload_broker_binding,
)
from src.platform.jobs.durable.errors import (
    DurableTaskEnvelopeMismatchError,
    DurableTaskRegistrationError,
    UnknownDurableTaskError,
)
from src.platform.jobs.durable.manifest import (
    DurableTaskDefinition,
    DurableTaskManifest,
    WorkloadRoute,
)

DurableTaskHandler = Callable[..., Awaitable[Any]]


class DurableProducerRegistry:
    """Global manifest bindings used only by the outbox dispatcher to publish."""

    __slots__ = ("_tasks", "brokers", "manifest")

    def __init__(
        self,
        *,
        manifest: DurableTaskManifest,
        brokers: ExactWorkloadBrokerSelector,
        tasks: Iterable[AsyncTaskiqDecoratedTask[Any, Any]],
    ) -> None:
        by_name = _registered_tasks_by_name(tasks=tasks, registry_label="producer")
        _validate_registered_task_names(manifest=manifest, by_name=by_name, registry_label="producer")

        for definition in manifest:
            task = by_name[definition.task_name]
            broker = brokers.select(definition.workload_class)
            _validate_task_broker_binding(definition=definition, task=task, broker=broker)
            if task.original_func is not _reject_producer_execution:
                raise DurableTaskRegistrationError(
                    f"producer task {definition.task_name!r} is not bound to the producer-only handler"
                )
        _validate_global_broker_task_sets(manifest=manifest, brokers=brokers)
        self.manifest = manifest
        self.brokers = brokers
        self._tasks = MappingProxyType(by_name)

    def resolve(self, task_name: str) -> tuple[DurableTaskDefinition, AsyncTaskiqDecoratedTask[Any, Any]]:
        definition = self.manifest.definition_for_task(task_name)
        task = self._tasks.get(task_name)
        if definition is None or task is None:
            raise UnknownDurableTaskError(task_name)
        return definition, task


class DurableWorkerRegistry:
    """One workload's exact task slice bound to one isolated gated broker."""

    __slots__ = ("_tasks", "broker", "manifest", "route", "workload_class")

    def __init__(
        self,
        *,
        manifest: DurableTaskManifest,
        workload_class: JobWorkloadClass,
        route: WorkloadRoute,
        broker: DurableRedisStreamBroker,
        handlers: Mapping[tuple[str, int], DurableTaskHandler],
        tasks: Iterable[AsyncTaskiqDecoratedTask[Any, Any]],
    ) -> None:
        if route.workload_class != workload_class:
            raise DurableTaskRegistrationError(
                f"worker route {route.workload_class.value!r} does not match workload {workload_class.value!r}"
            )
        if any(definition.workload_class != workload_class for definition in manifest):
            raise DurableTaskRegistrationError("worker manifest must contain exactly one workload slice")
        _validate_handler_bindings(manifest=manifest, handlers=handlers)
        by_name = _registered_tasks_by_name(tasks=tasks, registry_label="worker")
        _validate_registered_task_names(manifest=manifest, by_name=by_name, registry_label="worker")
        for definition in manifest:
            task = by_name[definition.task_name]
            _validate_task_broker_binding(
                definition=definition,
                task=task,
                broker=broker,
            )
            if task.original_func is not handlers[definition.job_identity]:
                raise DurableTaskRegistrationError(
                    f"worker task {definition.task_name!r} is not bound to its exact handler"
                )
        _validate_local_task_set(manifest=manifest, broker=broker, workload_class=workload_class)
        self.manifest = manifest
        self.workload_class = workload_class
        self.route = route
        self.broker = broker
        self._tasks = MappingProxyType(by_name)


def register_durable_producer_tasks(
    *,
    manifest: DurableTaskManifest,
    brokers: ExactWorkloadBrokerSelector,
) -> DurableProducerRegistry:
    """Register all publish definitions without importing any worker handlers."""

    _require_empty_global_brokers(brokers)
    tasks = [
        brokers.select(definition.workload_class).register_task(
            _reject_producer_execution,
            task_name=definition.task_name,
        )
        for definition in manifest
    ]
    return DurableProducerRegistry(manifest=manifest, brokers=brokers, tasks=tasks)


def register_durable_worker_tasks(
    *,
    manifest: DurableTaskManifest,
    workload_class: JobWorkloadClass,
    route: WorkloadRoute,
    broker: DurableRedisStreamBroker,
    handlers: Mapping[tuple[str, int], DurableTaskHandler],
) -> DurableWorkerRegistry:
    """Register only one workload slice and never inspect another workload's handlers."""

    try:
        normalized_workload = JobWorkloadClass(workload_class)
    except ValueError as exc:
        raise DurableTaskRegistrationError(f"unknown worker workload {workload_class!r}") from exc
    worker_manifest = manifest.for_workload(normalized_workload)
    _validate_handler_bindings(manifest=worker_manifest, handlers=handlers)
    validate_workload_broker_binding(route=route, broker=broker)
    if route.workload_class != normalized_workload:
        raise DurableTaskRegistrationError(
            f"worker route {route.workload_class.value!r} does not match workload {normalized_workload.value!r}"
        )
    _require_empty_worker_broker(broker=broker, workload_class=normalized_workload)
    tasks = [
        broker.register_task(
            handlers[definition.job_identity],
            task_name=definition.task_name,
        )
        for definition in worker_manifest
    ]
    return DurableWorkerRegistry(
        manifest=worker_manifest,
        workload_class=normalized_workload,
        route=route,
        broker=broker,
        handlers=handlers,
        tasks=tasks,
    )


def _validate_handler_bindings(
    *,
    manifest: DurableTaskManifest,
    handlers: Mapping[tuple[str, int], DurableTaskHandler],
) -> None:
    expected = {definition.job_identity for definition in manifest}
    actual = set(handlers)
    if actual != expected:
        missing = sorted(expected - actual)
        unexpected = sorted(actual - expected)
        raise DurableTaskRegistrationError(
            f"worker handler map must match workload manifest; missing={missing}, unexpected={unexpected}"
        )

    synchronous = sorted(
        f"{job_type}/v{version}"
        for (job_type, version), handler in handlers.items()
        if not inspect.iscoroutinefunction(handler)
    )
    if synchronous:
        raise DurableTaskRegistrationError(
            "durable Taskiq handlers must be async so ACK authorization remains in the Receiver callback context; "
            f"synchronous={synchronous}"
        )


class JobTransportDispatcher:
    """Publishes a validated durable envelope through its prebound Taskiq task."""

    def __init__(self, registry: DurableProducerRegistry) -> None:
        self.registry = registry

    async def dispatch(self, *, task_name: str, envelope: JobDispatchEnvelope) -> str:
        definition, task = self.registry.resolve(task_name)
        _validate_envelope(definition=definition, task_name=task_name, envelope=envelope)
        task_handle = await task.kiq(envelope.model_dump(mode="json", by_alias=True))
        return task_handle.task_id


def _registered_tasks_by_name(
    *,
    tasks: Iterable[AsyncTaskiqDecoratedTask[Any, Any]],
    registry_label: str,
) -> dict[str, AsyncTaskiqDecoratedTask[Any, Any]]:
    registered = tuple(tasks)
    by_name = {task.task_name: task for task in registered}
    if len(by_name) != len(registered):
        raise DurableTaskRegistrationError(f"{registry_label} Taskiq task names must be globally unique")
    return by_name


def _validate_registered_task_names(
    *,
    manifest: DurableTaskManifest,
    by_name: Mapping[str, AsyncTaskiqDecoratedTask[Any, Any]],
    registry_label: str,
) -> None:
    expected = {definition.task_name for definition in manifest}
    actual = set(by_name)
    if actual != expected:
        missing = sorted(expected - actual)
        unexpected = sorted(actual - expected)
        raise DurableTaskRegistrationError(
            f"{registry_label} task definitions differ from manifest; missing={missing}, unexpected={unexpected}"
        )


def _validate_task_broker_binding(
    *,
    definition: DurableTaskDefinition,
    task: AsyncTaskiqDecoratedTask[Any, Any],
    broker: DurableRedisStreamBroker,
) -> None:
    if task.broker is not broker or broker.find_task(definition.task_name) is not task:
        raise DurableTaskRegistrationError(
            f"task {definition.task_name!r} is not registered on workload {definition.workload_class.value!r}"
        )


def _require_empty_global_brokers(brokers: ExactWorkloadBrokerSelector) -> None:
    contaminated = {
        workload.value: sorted(broker.local_task_registry)
        for workload, broker in brokers.items()
        if broker.local_task_registry
    }
    if contaminated:
        raise DurableTaskRegistrationError(f"durable producer brokers already have registered tasks: {contaminated}")


def _require_empty_worker_broker(
    *,
    broker: DurableRedisStreamBroker,
    workload_class: JobWorkloadClass,
) -> None:
    if broker.local_task_registry:
        names = sorted(broker.local_task_registry)
        raise DurableTaskRegistrationError(
            f"durable worker broker for {workload_class.value!r} already has registered tasks: {names}"
        )


def _validate_global_broker_task_sets(
    *,
    manifest: DurableTaskManifest,
    brokers: ExactWorkloadBrokerSelector,
) -> None:
    expected_by_workload = {
        workload: {definition.task_name for definition in manifest if definition.workload_class == workload}
        for workload in JobWorkloadClass
    }
    for workload, broker in brokers.items():
        actual = set(broker.local_task_registry)
        expected = expected_by_workload[workload]
        if actual != expected:
            missing = sorted(expected - actual)
            unexpected = sorted(actual - expected)
            raise DurableTaskRegistrationError(
                f"producer registry differs for workload {workload.value!r}; missing={missing}, unexpected={unexpected}"
            )


def _validate_local_task_set(
    *,
    manifest: DurableTaskManifest,
    broker: DurableRedisStreamBroker,
    workload_class: JobWorkloadClass,
) -> None:
    expected = {definition.task_name for definition in manifest}
    actual = set(broker.local_task_registry)
    if actual != expected:
        missing = sorted(expected - actual)
        unexpected = sorted(actual - expected)
        raise DurableTaskRegistrationError(
            f"worker registry differs for workload {workload_class.value!r}; missing={missing}, unexpected={unexpected}"
        )


async def _reject_producer_execution(_: JsonObject) -> None:
    raise DurableTaskRegistrationError(
        "durable producer registry cannot execute tasks; start the matching single-workload worker"
    )


def _validate_envelope(
    *,
    definition: DurableTaskDefinition,
    task_name: str,
    envelope: JobDispatchEnvelope,
) -> None:
    mismatched_fields: list[str] = []
    if envelope.job_type != definition.job_type:
        mismatched_fields.append("jobType")
    if envelope.job_type_version != definition.job_type_version:
        mismatched_fields.append("jobTypeVersion")
    if JobWorkloadClass(envelope.workload_class) != definition.workload_class:
        mismatched_fields.append("workloadClass")
    if envelope.message_schema_version != definition.message_schema_version:
        mismatched_fields.append("messageSchemaVersion")
    if mismatched_fields:
        raise DurableTaskEnvelopeMismatchError(
            task_name=task_name,
            mismatched_fields=tuple(mismatched_fields),
        )
