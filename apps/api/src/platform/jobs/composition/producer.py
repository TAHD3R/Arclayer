from __future__ import annotations

import asyncio
import os
import signal
import socket
from uuid import UUID

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.config import Settings, get_settings
from src.core.database.orm import close_orm, init_orm, verify_db_ready
from src.core.logging import configure_logging, get_logger
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.dispatch_service import JobDispatchService
from src.modules.jobs.execution_registry import derive_durable_task_manifest
from src.modules.jobs.schema import JobDispatchPolicy
from src.platform.jobs.durable.brokers import (
    ExactWorkloadBrokerSelector,
    build_taskiq_workload_broker_selector,
    workload_broker_tuning_from_settings,
)

logger = get_logger(__name__)
from src.platform.jobs.durable.dispatcher import (
    DurableProducerRegistry,
    JobTransportDispatcher,
    register_durable_producer_tasks,
)


class DurableJobProducerRuntime(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
    )

    brokers: ExactWorkloadBrokerSelector
    registry: DurableProducerRegistry
    transport: JobTransportDispatcher
    dispatch_service: JobDispatchService


def build_producer_runtime(
    *,
    settings: Settings,
    producer_identity: str,
) -> DurableJobProducerRuntime:
    job_types = build_builtin_job_type_registry(settings)
    task_manifest = derive_durable_task_manifest(job_types)
    tuning = {
        workload: workload_broker_tuning_from_settings(
            settings,
            workload_class=workload,
        )
        for workload in JobWorkloadClass
    }
    brokers = build_taskiq_workload_broker_selector(
        settings,
        consumer_identity=producer_identity,
        tuning_by_workload=tuning,
    )
    registry = register_durable_producer_tasks(
        manifest=task_manifest,
        brokers=brokers,
    )
    return DurableJobProducerRuntime(
        brokers=brokers,
        registry=registry,
        transport=JobTransportDispatcher(registry),
        dispatch_service=JobDispatchService(
            settings,
            event_publisher=None,
        ),
    )


async def dispatch_once(
    *,
    runtime: DurableJobProducerRuntime,
    dispatcher_id: str,
    policy: JobDispatchPolicy,
    limit: int,
) -> int:
    dispatches = await runtime.dispatch_service.claim_due_dispatches(
        dispatcher_id=dispatcher_id,
        limit=limit,
        policy=policy,
    )
    for dispatch in dispatches:
        claim_token = dispatch.claim_token
        if not isinstance(claim_token, UUID):
            raise RuntimeError(f"Claimed dispatch {dispatch.id} is missing its UUID claim token")
        await runtime.dispatch_service.dispatch_claimed(
            dispatch_id=dispatch.id,
            claim_token=claim_token,
            transport=runtime.transport,
            policy=policy,
        )
    return len(dispatches)


async def run_producer() -> None:
    settings = get_settings()
    configure_logging(settings)
    if not settings.database.enabled:
        raise RuntimeError("Durable Job dispatcher requires the canonical PostgreSQL database")
    if not settings.taskiq.enabled:
        raise RuntimeError("Durable Job dispatcher requires TASKIQ__ENABLED=true")
    configured_identity = settings.taskiq.consumer_identity
    identity_prefix = configured_identity or socket.gethostname()
    dispatcher_id = f"{identity_prefix}:{os.getpid()}:dispatcher"
    runtime = build_producer_runtime(
        settings=settings,
        producer_identity=dispatcher_id,
    )
    policy_settings = settings.background_jobs.dispatcher
    policy = JobDispatchPolicy(
        lease_seconds=policy_settings.lease_seconds,
        max_attempts=policy_settings.max_attempts,
        retry_delay_seconds=policy_settings.retry_delay_seconds,
    )
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, stop.set)

    await init_orm(settings)
    await verify_db_ready(settings)
    started_brokers = []
    try:
        for _, broker in runtime.brokers.items():
            await broker.startup()
            started_brokers.append(broker)
        logger.info(
            "Durable Job dispatcher ready",
            action="durable_job_dispatcher_ready",
            dispatcher_id=dispatcher_id,
            task_count=len(runtime.registry.manifest),
        )
        while not stop.is_set():
            dispatched = await dispatch_once(
                runtime=runtime,
                dispatcher_id=dispatcher_id,
                policy=policy,
                limit=policy_settings.batch_size,
            )
            if dispatched > 0:
                continue
            try:
                await asyncio.wait_for(
                    stop.wait(),
                    timeout=policy_settings.poll_interval_seconds,
                )
            except TimeoutError:
                continue
    finally:
        for broker in reversed(started_brokers):
            await broker.shutdown()
        await close_orm()


def main() -> None:
    asyncio.run(run_producer())


if __name__ == "__main__":
    main()
