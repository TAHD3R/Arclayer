from __future__ import annotations

from collections.abc import Iterator, Mapping
from types import MappingProxyType

from pydantic import BaseModel, ConfigDict, Field

from src.config import Settings
from src.models.jobs.background_job import JobWorkloadClass
from src.platform.jobs.durable.ack import DurableRedisStreamBroker
from src.platform.jobs.durable.errors import DurableTaskManifestError, DurableTaskRegistrationError
from src.platform.jobs.durable.manifest import TaskiqWorkloadManifest, WorkloadRoute


class WorkloadBrokerTuning(BaseModel):
    """Explicit capacity inputs; production values remain blocked on the ADR gates."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    max_connection_pool_size: int = Field(..., ge=2)
    xread_block_milliseconds: int = Field(..., ge=1)
    xread_count: int = Field(..., ge=1)
    idle_timeout_milliseconds: int = Field(..., ge=1)
    unacknowledged_batch_size: int = Field(..., ge=1)
    unacknowledged_lock_timeout_seconds: float = Field(..., gt=0)


class ExactWorkloadBrokerSelector:
    """Selects one prevalidated broker from a typed workload, never a caller label."""

    __slots__ = ("_brokers", "manifest")

    def __init__(
        self,
        *,
        manifest: TaskiqWorkloadManifest,
        brokers: Mapping[JobWorkloadClass, DurableRedisStreamBroker],
    ) -> None:
        expected = {route.workload_class for route in manifest}
        actual = set(brokers)
        if actual != expected:
            missing = sorted(workload.value for workload in expected - actual)
            unexpected = sorted(str(workload) for workload in actual - expected)
            raise DurableTaskRegistrationError(
                f"broker map must be exhaustive; missing={missing}, unexpected={unexpected}"
            )

        copied = dict(brokers)
        for route in manifest:
            validate_workload_broker_binding(route=route, broker=copied[route.workload_class])
        self.manifest = manifest
        self._brokers = MappingProxyType(copied)

    def select(self, workload_class: JobWorkloadClass) -> DurableRedisStreamBroker:
        try:
            normalized = JobWorkloadClass(workload_class)
            return self._brokers[normalized]
        except (KeyError, ValueError) as exc:
            raise DurableTaskRegistrationError(f"unknown workload broker {workload_class!r}") from exc

    def items(self) -> Iterator[tuple[JobWorkloadClass, DurableRedisStreamBroker]]:
        return iter(self._brokers.items())


def workload_broker_tuning_from_settings(
    settings: Settings,
    *,
    workload_class: JobWorkloadClass,
) -> WorkloadBrokerTuning:
    field_name = workload_class.value.replace("-", "_")
    configured = getattr(settings.taskiq.workloads, field_name)
    return WorkloadBrokerTuning(
        max_connection_pool_size=configured.max_connection_pool_size,
        xread_block_milliseconds=configured.xread_block_milliseconds,
        xread_count=configured.xread_count,
        idle_timeout_milliseconds=configured.idle_timeout_milliseconds,
        unacknowledged_batch_size=configured.unacknowledged_batch_size,
        unacknowledged_lock_timeout_seconds=configured.unacknowledged_lock_timeout_seconds,
    )


def build_taskiq_workload_broker_selector(
    settings: Settings,
    *,
    consumer_identity: str,
    tuning_by_workload: Mapping[JobWorkloadClass, WorkloadBrokerTuning],
) -> ExactWorkloadBrokerSelector:
    """Build six isolated Redis Stream brokers from the existing Taskiq settings."""

    manifest = build_taskiq_workload_manifest(settings)
    expected_workloads = {route.workload_class for route in manifest}
    configured_workloads = set(tuning_by_workload)
    if configured_workloads != expected_workloads:
        missing = sorted(workload.value for workload in expected_workloads - configured_workloads)
        unexpected = sorted(str(workload) for workload in configured_workloads - expected_workloads)
        raise DurableTaskManifestError(
            f"broker tuning must be explicit for every workload; missing={missing}, unexpected={unexpected}"
        )

    brokers = {
        route.workload_class: build_taskiq_workload_broker(
            settings,
            route=route,
            consumer_identity=consumer_identity,
            tuning=tuning_by_workload[route.workload_class],
        )
        for route in manifest
    }
    return ExactWorkloadBrokerSelector(manifest=manifest, brokers=brokers)


def build_taskiq_workload_manifest(settings: Settings) -> TaskiqWorkloadManifest:
    return TaskiqWorkloadManifest.for_prefixes(
        stream_prefix=settings.taskiq.stream_prefix,
        consumer_group_prefix=settings.taskiq.consumer_group_prefix,
    )


def build_taskiq_workload_broker(
    settings: Settings,
    *,
    route: WorkloadRoute,
    consumer_identity: str,
    tuning: WorkloadBrokerTuning,
) -> DurableRedisStreamBroker:
    """Build exactly one isolated broker without constructing any other workload."""

    normalized_identity = consumer_identity.strip()
    if not normalized_identity:
        raise DurableTaskManifestError("consumer identity must contain non-whitespace characters")
    dsn = settings.taskiq.redis_dsn or settings.valkey.dsn
    broker = DurableRedisStreamBroker(
        url=dsn,
        queue_name=route.stream_name,
        max_connection_pool_size=tuning.max_connection_pool_size,
        consumer_group_name=route.consumer_group_name,
        consumer_name=f"{normalized_identity}:{route.workload_class.value}",
        consumer_id="0-0",
        mkstream=True,
        xread_block=tuning.xread_block_milliseconds,
        xread_count=tuning.xread_count,
        idle_timeout=tuning.idle_timeout_milliseconds,
        unacknowledged_batch_size=tuning.unacknowledged_batch_size,
        additional_streams={},
        unacknowledged_lock_timeout=tuning.unacknowledged_lock_timeout_seconds,
    )
    validate_workload_broker_binding(route=route, broker=broker)
    return broker


def validate_workload_broker_binding(*, route: WorkloadRoute, broker: DurableRedisStreamBroker) -> None:
    if not isinstance(broker, DurableRedisStreamBroker):
        raise DurableTaskRegistrationError(
            f"broker for {route.workload_class.value!r} must use DurableRedisStreamBroker ACK gating"
        )
    if broker.queue_name != route.stream_name:
        raise DurableTaskRegistrationError(
            f"broker for {route.workload_class.value!r} uses stream {broker.queue_name!r}, expected {route.stream_name!r}"
        )
    if broker.consumer_group_name != route.consumer_group_name:
        raise DurableTaskRegistrationError(
            f"broker for {route.workload_class.value!r} uses consumer group "
            f"{broker.consumer_group_name!r}, expected {route.consumer_group_name!r}"
        )
    if broker.additional_streams:
        raise DurableTaskRegistrationError(
            f"broker for {route.workload_class.value!r} must not consume additional streams"
        )
    if broker.consumer_id != "0-0" or not broker.mkstream:
        raise DurableTaskRegistrationError(
            f"broker for {route.workload_class.value!r} must use consumer_id='0-0' and mkstream=True"
        )
    if broker.unacknowledged_lock_timeout is None:
        raise DurableTaskRegistrationError(
            f"broker for {route.workload_class.value!r} must configure an unacknowledged lock timeout"
        )
