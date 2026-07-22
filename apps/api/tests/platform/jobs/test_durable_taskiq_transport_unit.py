from __future__ import annotations

from typing import Any, cast
from uuid import uuid4

import pytest
from taskiq import BrokerMessage
from taskiq_redis import RedisStreamBroker

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.jobs.schema import JobDispatchEnvelope
from src.platform.jobs.durable import (
    CANONICAL_JOB_WORKLOADS,
    DurableProducerRegistry,
    DurableRedisStreamBroker,
    DurableTaskDefinition,
    DurableTaskEnvelopeMismatchError,
    DurableTaskManifest,
    DurableTaskManifestError,
    DurableTaskRegistrationError,
    DurableWorkerRegistry,
    ExactWorkloadBrokerSelector,
    JobTransportDispatcher,
    TaskiqWorkloadManifest,
    UnknownDurableTaskError,
    WorkloadBrokerTuning,
    build_taskiq_workload_broker,
    build_taskiq_workload_broker_selector,
    build_taskiq_workload_manifest,
    register_durable_producer_tasks,
    register_durable_worker_tasks,
)

pytestmark = pytest.mark.unit


def _settings() -> Settings:
    return Settings(
        app_env="test",
        database={"enabled": False},
        taskiq={
            "stream_prefix": "arclayer:durable-test",
            "consumer_group_prefix": "arclayer:durable-test:workers",
            "redis_dsn": "redis://127.0.0.1:6379/15",
        },
    )


def _tuning() -> dict[JobWorkloadClass, WorkloadBrokerTuning]:
    return {
        workload: WorkloadBrokerTuning(
            max_connection_pool_size=2,
            xread_block_milliseconds=25,
            xread_count=1,
            idle_timeout_milliseconds=50,
            unacknowledged_batch_size=1,
            unacknowledged_lock_timeout_seconds=1,
        )
        for workload in CANONICAL_JOB_WORKLOADS
    }


def _brokers():
    return build_taskiq_workload_broker_selector(
        _settings(),
        consumer_identity="unit-worker",
        tuning_by_workload=_tuning(),
    )


def _worker_broker(workload: JobWorkloadClass):
    physical_manifest = build_taskiq_workload_manifest(_settings())
    route = physical_manifest.route_for(workload)
    return route, build_taskiq_workload_broker(
        _settings(),
        route=route,
        consumer_identity="unit-worker",
        tuning=_tuning()[workload],
    )


def _definition(
    *,
    job_type: str = "asset.thumbnail.generate",
    version: int = 1,
    workload: JobWorkloadClass = JobWorkloadClass.ASSET_CPU,
    task_slug: str = "asset-thumbnail-generate",
    schema_version: int = 1,
) -> DurableTaskDefinition:
    return DurableTaskDefinition(
        job_type=job_type,
        job_type_version=version,
        task_name=f"jobs:{workload.value}:{task_slug}:v{version}",
        workload_class=workload,
        message_schema_version=schema_version,
    )


def _all_workload_definitions() -> tuple[DurableTaskDefinition, ...]:
    return tuple(
        _definition(
            job_type=f"test.{workload.value}",
            workload=workload,
            task_slug=f"{workload.value}-task",
        )
        for workload in CANONICAL_JOB_WORKLOADS
    )


def _envelope(
    definition: DurableTaskDefinition,
    **updates: Any,
) -> JobDispatchEnvelope:
    values: dict[str, Any] = {
        "job_id": uuid4(),
        "dispatch_sequence": 1,
        "job_type": definition.job_type,
        "job_type_version": definition.job_type_version,
        "workload_class": definition.workload_class,
        "message_schema_version": definition.message_schema_version,
        "target_descriptor": {"assetId": str(uuid4())},
        "request_fingerprint": "a" * 64,
    }
    values.update(updates)
    return JobDispatchEnvelope.model_validate(values)


def _registry(definition: DurableTaskDefinition):
    brokers = _brokers()
    manifest = DurableTaskManifest([definition])
    registry = register_durable_producer_tasks(
        manifest=manifest,
        brokers=brokers,
    )
    return brokers, registry


def test_workload_manifest_is_exhaustive_and_has_one_physical_route_per_workload() -> None:
    manifest = TaskiqWorkloadManifest.for_prefixes(
        stream_prefix="arclayer:jobs",
        consumer_group_prefix="arclayer:workers",
    )

    assert [route.workload_class for route in manifest] == list(CANONICAL_JOB_WORKLOADS)
    assert len({route.stream_name for route in manifest}) == 6
    assert manifest.route_for(JobWorkloadClass.AGENT_IO).stream_name == "arclayer:jobs:agent-io"


def test_broker_factory_requires_explicit_capacity_inputs_for_every_workload() -> None:
    tuning = _tuning()
    tuning.pop(JobWorkloadClass.CONNECTOR)

    with pytest.raises(DurableTaskManifestError, match="explicit for every workload"):
        build_taskiq_workload_broker_selector(
            _settings(),
            consumer_identity="unit-worker",
            tuning_by_workload=tuning,
        )


def test_broker_selector_builds_six_exact_isolated_stream_brokers() -> None:
    selector = _brokers()

    for workload in CANONICAL_JOB_WORKLOADS:
        broker = selector.select(workload)
        assert isinstance(broker, DurableRedisStreamBroker)
        assert broker.queue_name == f"arclayer:durable-test:{workload.value}"
        assert broker.consumer_group_name == f"arclayer:durable-test:workers:{workload.value}"
        assert broker.consumer_id == "0-0"
        assert broker.mkstream is True
        assert broker.additional_streams == {}
        assert broker.unacknowledged_lock_timeout == 1


def test_broker_selector_rejects_a_plain_broker_that_bypasses_ack_gating() -> None:
    selector = _brokers()
    workload = JobWorkloadClass.ASSET_CPU
    route = selector.manifest.route_for(workload)
    brokers = dict(selector.items())
    brokers[workload] = cast(
        DurableRedisStreamBroker,
        RedisStreamBroker(
            "redis://127.0.0.1:6379/15",
            queue_name=route.stream_name,
            consumer_group_name=route.consumer_group_name,
        ),
    )

    with pytest.raises(DurableTaskRegistrationError, match="ACK gating"):
        ExactWorkloadBrokerSelector(manifest=selector.manifest, brokers=brokers)


def test_task_manifest_rejects_duplicate_task_name_globally() -> None:
    first = _definition(job_type="asset.thumbnail.generate")
    second = first.model_copy(update={"job_type": "asset.thumbnail.refresh"})

    with pytest.raises(DurableTaskManifestError, match="duplicate Taskiq task name"):
        DurableTaskManifest([first, second])


def test_task_manifest_rejects_duplicate_job_type_version_across_workloads() -> None:
    first = _definition()
    second = _definition(
        job_type=first.job_type,
        workload=JobWorkloadClass.RENDER_BROWSER,
        task_slug="asset-thumbnail-render",
    )

    with pytest.raises(DurableTaskManifestError, match="duplicate durable job type/version"):
        DurableTaskManifest([first, second])


@pytest.mark.parametrize("workload", CANONICAL_JOB_WORKLOADS)
def test_task_manifest_for_workload_returns_only_the_exact_definition_slice(
    workload: JobWorkloadClass,
) -> None:
    definitions = _all_workload_definitions()

    sliced = DurableTaskManifest(definitions).for_workload(workload)

    assert tuple(sliced) == tuple(definition for definition in definitions if definition.workload_class == workload)


def test_task_manifest_for_workload_allows_an_explicit_empty_slice() -> None:
    definition = _definition(workload=JobWorkloadClass.ASSET_CPU)

    sliced = DurableTaskManifest([definition]).for_workload(JobWorkloadClass.CONNECTOR)

    assert tuple(sliced) == ()


def test_registration_rejects_missing_handler_before_touching_taskiq_registry() -> None:
    definition = _definition()
    route, broker = _worker_broker(definition.workload_class)

    with pytest.raises(DurableTaskRegistrationError, match="worker handler map must match workload manifest"):
        register_durable_worker_tasks(
            manifest=DurableTaskManifest([definition]),
            workload_class=definition.workload_class,
            route=route,
            broker=broker,
            handlers={},
        )

    assert not broker.local_task_registry


def test_registration_rejects_unexpected_handler_before_touching_taskiq_registry() -> None:
    definition = _definition()
    route, broker = _worker_broker(definition.workload_class)

    async def handler(_: JsonObject) -> None:
        return None

    with pytest.raises(DurableTaskRegistrationError, match="unexpected"):
        register_durable_worker_tasks(
            manifest=DurableTaskManifest([definition]),
            workload_class=definition.workload_class,
            route=route,
            broker=broker,
            handlers={definition.job_identity: handler, ("unexpected.job", 1): handler},
        )

    assert not broker.local_task_registry


def test_registration_rejects_sync_handler_before_touching_taskiq_registry() -> None:
    definition = _definition()
    route, broker = _worker_broker(definition.workload_class)

    def handler(_: JsonObject) -> None:
        return None

    with pytest.raises(DurableTaskRegistrationError, match="handlers must be async"):
        register_durable_worker_tasks(
            manifest=DurableTaskManifest([definition]),
            workload_class=definition.workload_class,
            route=route,
            broker=broker,
            handlers={definition.job_identity: cast(Any, handler)},
        )

    assert not broker.local_task_registry


def test_registration_rejects_existing_task_instead_of_silently_overwriting() -> None:
    definition = _definition()
    route, broker = _worker_broker(definition.workload_class)
    broker.register_task(lambda _: None, task_name=definition.task_name)

    async def handler(_: JsonObject) -> None:
        return None

    with pytest.raises(DurableTaskRegistrationError, match="already has registered tasks"):
        register_durable_worker_tasks(
            manifest=DurableTaskManifest([definition]),
            workload_class=definition.workload_class,
            route=route,
            broker=broker,
            handlers={definition.job_identity: handler},
        )


@pytest.mark.parametrize("workload", CANONICAL_JOB_WORKLOADS)
def test_single_workload_worker_registers_only_its_handler_and_broker(
    workload: JobWorkloadClass,
) -> None:
    definitions = _all_workload_definitions()
    selected = next(definition for definition in definitions if definition.workload_class == workload)
    route, broker = _worker_broker(workload)

    async def selected_handler(_: JsonObject) -> None:
        return None

    registry = register_durable_worker_tasks(
        manifest=DurableTaskManifest(definitions),
        workload_class=workload,
        route=route,
        broker=broker,
        handlers={selected.job_identity: selected_handler},
    )

    assert tuple(registry.manifest) == (selected,)
    assert registry.broker is broker
    assert registry.route is route
    assert set(broker.local_task_registry) == {selected.task_name}


def test_single_workload_worker_with_no_definitions_requires_no_handlers() -> None:
    definition = _definition(workload=JobWorkloadClass.ASSET_CPU)
    route, broker = _worker_broker(JobWorkloadClass.CONNECTOR)

    registry = register_durable_worker_tasks(
        manifest=DurableTaskManifest([definition]),
        workload_class=JobWorkloadClass.CONNECTOR,
        route=route,
        broker=broker,
        handlers={},
    )

    assert tuple(registry.manifest) == ()
    assert not broker.local_task_registry


def test_single_workload_worker_rejects_a_different_workload_route() -> None:
    definition = _definition(workload=JobWorkloadClass.ASSET_CPU)
    route, broker = _worker_broker(JobWorkloadClass.AGENT_IO)

    async def handler(_: JsonObject) -> None:
        return None

    with pytest.raises(DurableTaskRegistrationError, match="does not match workload"):
        register_durable_worker_tasks(
            manifest=DurableTaskManifest([definition]),
            workload_class=JobWorkloadClass.ASSET_CPU,
            route=route,
            broker=broker,
            handlers={definition.job_identity: handler},
        )

    assert not broker.local_task_registry


@pytest.mark.asyncio
async def test_dispatcher_publishes_typed_envelope_only_through_registered_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    definition = _definition()
    brokers, registry = _registry(definition)
    broker = brokers.select(definition.workload_class)
    captured: list[BrokerMessage] = []

    async def capture(message: BrokerMessage) -> None:
        captured.append(message)

    monkeypatch.setattr(broker, "kick", capture)
    envelope = _envelope(definition)

    message_id = await JobTransportDispatcher(registry).dispatch(
        task_name=definition.task_name,
        envelope=envelope,
    )

    assert message_id == captured[0].task_id
    assert captured[0].task_name == definition.task_name
    assert "queue_name" not in captured[0].labels
    taskiq_message = broker.formatter.loads(captured[0].message)
    assert taskiq_message.args == [envelope.model_dump(mode="json", by_alias=True)]
    assert taskiq_message.kwargs == {}


def test_producer_registration_rejects_contaminated_broker_before_registering_manifest() -> None:
    definitions = _all_workload_definitions()
    brokers = _brokers()
    contaminated = brokers.select(JobWorkloadClass.AGENT_IO)
    contaminated.register_task(lambda: None, task_name="unexpected:producer-task:v1")

    with pytest.raises(DurableTaskRegistrationError, match="producer brokers already have registered tasks"):
        register_durable_producer_tasks(
            manifest=DurableTaskManifest(definitions),
            brokers=brokers,
        )

    for workload, broker in brokers.items():
        expected = {"unexpected:producer-task:v1"} if workload == JobWorkloadClass.AGENT_IO else set()
        assert set(broker.local_task_registry) == expected


def test_producer_registry_rejects_a_worker_handler_binding() -> None:
    definition = _definition()
    brokers = _brokers()
    broker = brokers.select(definition.workload_class)

    async def worker_handler(_: JsonObject) -> None:
        return None

    task = broker.register_task(worker_handler, task_name=definition.task_name)

    with pytest.raises(DurableTaskRegistrationError, match="producer-only handler"):
        DurableProducerRegistry(
            manifest=DurableTaskManifest([definition]),
            brokers=brokers,
            tasks=[task],
        )


def test_worker_registry_rejects_a_different_handler_binding() -> None:
    definition = _definition()
    route, broker = _worker_broker(definition.workload_class)

    async def expected_handler(_: JsonObject) -> None:
        return None

    async def wrong_handler(_: JsonObject) -> None:
        return None

    task = broker.register_task(wrong_handler, task_name=definition.task_name)

    with pytest.raises(DurableTaskRegistrationError, match="exact handler"):
        DurableWorkerRegistry(
            manifest=DurableTaskManifest([definition]),
            workload_class=definition.workload_class,
            route=route,
            broker=broker,
            handlers={definition.job_identity: expected_handler},
            tasks=[task],
        )


@pytest.mark.asyncio
async def test_global_producer_registry_routes_every_workload_through_its_exact_broker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    definitions = _all_workload_definitions()
    brokers = _brokers()
    registry = register_durable_producer_tasks(
        manifest=DurableTaskManifest(definitions),
        brokers=brokers,
    )
    captured: dict[JobWorkloadClass, list[BrokerMessage]] = {workload: [] for workload in CANONICAL_JOB_WORKLOADS}

    for workload in CANONICAL_JOB_WORKLOADS:
        broker = brokers.select(workload)

        async def capture(
            message: BrokerMessage,
            *,
            selected_workload: JobWorkloadClass = workload,
        ) -> None:
            captured[selected_workload].append(message)

        monkeypatch.setattr(broker, "kick", capture)

    dispatcher = JobTransportDispatcher(registry)
    for definition in definitions:
        message_id = await dispatcher.dispatch(
            task_name=definition.task_name,
            envelope=_envelope(definition),
        )
        message = captured[definition.workload_class][0]
        assert message_id == message.task_id
        assert message.task_name == definition.task_name
        assert "queue_name" not in message.labels

    assert {workload: len(messages) for workload, messages in captured.items()} == dict.fromkeys(
        CANONICAL_JOB_WORKLOADS,
        1,
    )


@pytest.mark.asyncio
async def test_dispatcher_rejects_unknown_task_without_publishing(monkeypatch: pytest.MonkeyPatch) -> None:
    definition = _definition()
    brokers, registry = _registry(definition)
    broker = brokers.select(definition.workload_class)
    calls: list[BrokerMessage] = []

    async def capture(message: BrokerMessage) -> None:
        calls.append(message)

    monkeypatch.setattr(broker, "kick", capture)

    with pytest.raises(UnknownDurableTaskError, match="DURABLE_TASK_UNKNOWN"):
        await JobTransportDispatcher(registry).dispatch(
            task_name="jobs:asset-cpu:unknown:v1",
            envelope=_envelope(definition),
        )

    assert calls == []


@pytest.mark.parametrize(
    ("updates", "field"),
    [
        ({"job_type": "asset.thumbnail.refresh"}, "jobType"),
        ({"job_type_version": 2}, "jobTypeVersion"),
        ({"workload_class": JobWorkloadClass.AGENT_IO}, "workloadClass"),
        ({"message_schema_version": 2}, "messageSchemaVersion"),
    ],
)
@pytest.mark.asyncio
async def test_dispatcher_rejects_manifest_envelope_mismatch_before_publish(
    monkeypatch: pytest.MonkeyPatch,
    updates: dict[str, Any],
    field: str,
) -> None:
    definition = _definition()
    brokers, registry = _registry(definition)
    broker = brokers.select(definition.workload_class)
    calls: list[BrokerMessage] = []

    async def capture(message: BrokerMessage) -> None:
        calls.append(message)

    monkeypatch.setattr(broker, "kick", capture)

    with pytest.raises(DurableTaskEnvelopeMismatchError, match=field):
        await JobTransportDispatcher(registry).dispatch(
            task_name=definition.task_name,
            envelope=_envelope(definition, **updates),
        )

    assert calls == []
