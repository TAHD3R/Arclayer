from __future__ import annotations

import os
import socket
from pathlib import Path

from pydantic import ConfigDict
from taskiq import TaskiqEvents, TaskiqState

from src.agents.langgraph_runtime import AgentGraphCheckpointerFactory
from src.common.schemas import BaseSchema
from src.config import Settings, get_settings
from src.core.database.orm import close_orm, init_orm, verify_db_ready
from src.core.extensions.manager import ExtensionManager
from src.core.logging import configure_logging, drain_async_logging, get_logger
from src.models.jobs.background_job import JobWorkloadClass
from src.platform.jobs.composition.execution import JobExecutionRuntime, build_job_execution_runtime
from src.platform.jobs.durable.ack import DurableRedisStreamBroker
from src.platform.jobs.durable.brokers import (
    build_taskiq_workload_broker,
    build_taskiq_workload_manifest,
    workload_broker_tuning_from_settings,
)
from src.platform.jobs.durable.delivery_handler import build_durable_delivery_handler
from src.platform.jobs.durable.dispatcher import DurableWorkerRegistry, register_durable_worker_tasks
from src.platform.jobs.provider_effect_recovery import (
    PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME,
    register_provider_effect_recovery_scan,
)

logger = get_logger(__name__)


class WorkloadWorkerRuntime(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    workload_class: JobWorkloadClass
    broker: DurableRedisStreamBroker
    worker_registry: DurableWorkerRegistry
    execution: JobExecutionRuntime
    extension_manager: ExtensionManager | None = None
    control_task_names: tuple[str, ...] = ()


def build_configured_workload_worker_runtime(
    workload_class: JobWorkloadClass,
) -> WorkloadWorkerRuntime:
    settings = get_settings()
    configured_identity = settings.taskiq.consumer_identity
    identity_prefix = configured_identity or socket.gethostname()
    process_identity = f"{identity_prefix}:{os.getpid()}"
    return build_workload_worker_runtime(
        settings=settings,
        workload_class=workload_class,
        consumer_identity=process_identity,
    )


def build_workload_worker_runtime(
    *,
    settings: Settings,
    workload_class: JobWorkloadClass,
    consumer_identity: str,
    agent_checkpointer_factory: AgentGraphCheckpointerFactory | None = None,
) -> WorkloadWorkerRuntime:
    """Build one broker and only the executable task slice owned by its workload."""

    physical_manifest = build_taskiq_workload_manifest(settings)
    route = physical_manifest.route_for(workload_class)
    broker = build_taskiq_workload_broker(
        settings,
        route=route,
        consumer_identity=consumer_identity,
        tuning=workload_broker_tuning_from_settings(
            settings,
            workload_class=workload_class,
        ),
    )
    extension_manager = (
        ExtensionManager(_resolve_project_root()) if workload_class == JobWorkloadClass.CONNECTOR else None
    )
    execution = build_job_execution_runtime(
        settings=settings,
        workload_class=workload_class,
        agent_checkpointer_factory=agent_checkpointer_factory,
        connector_registry=(None if extension_manager is None else extension_manager.registry.connectors),
    )
    durable_manifest = execution.handlers.derive_task_manifest()
    delivery_handler = build_durable_delivery_handler(
        executor=execution.executor,
        worker_id=f"{consumer_identity}:{workload_class.value}",
    )
    handler_map = {definition.job_identity: delivery_handler for definition in durable_manifest}
    worker_registry = register_durable_worker_tasks(
        manifest=durable_manifest,
        workload_class=workload_class,
        route=route,
        broker=broker,
        handlers=handler_map,
    )
    control_task_names: tuple[str, ...] = ()
    if workload_class == JobWorkloadClass.MAINTENANCE:
        register_provider_effect_recovery_scan(broker=broker, settings=settings)
        control_task_names = (PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME,)
    runtime = WorkloadWorkerRuntime(
        workload_class=workload_class,
        broker=broker,
        worker_registry=worker_registry,
        execution=execution,
        extension_manager=extension_manager,
        control_task_names=control_task_names,
    )
    _register_lifecycle(runtime=runtime, settings=settings)
    return runtime


def _register_lifecycle(
    *,
    runtime: WorkloadWorkerRuntime,
    settings: Settings,
) -> None:
    @runtime.broker.on_event(TaskiqEvents.WORKER_STARTUP)
    async def worker_startup(state: TaskiqState) -> None:
        configure_logging(settings)
        if not settings.database.enabled:
            raise RuntimeError("Durable Job workers require the canonical PostgreSQL database")
        if not settings.taskiq.enabled:
            raise RuntimeError("Durable Job worker started while TASKIQ__ENABLED is false")
        state["settings"] = settings
        state["durable_job_runtime"] = runtime
        await init_orm(settings)
        await verify_db_ready(settings)
        if runtime.extension_manager is not None:
            await runtime.extension_manager.load_all()
            await runtime.extension_manager.register_all(state)
        logger.info(
            "Durable Job worker ready",
            action="durable_job_worker_ready",
            workload=runtime.workload_class.value,
            stream=runtime.broker.queue_name,
            consumer_group=runtime.broker.consumer_group_name,
            consumer_identity=runtime.broker.consumer_name,
            registered_tasks=sorted(runtime.broker.local_task_registry),
        )

    @runtime.broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
    async def worker_shutdown(_: TaskiqState) -> None:
        if runtime.extension_manager is not None:
            await runtime.extension_manager.destroy_all()
        await close_orm()
        logger.info(
            "Durable Job worker stopped",
            workload=runtime.workload_class.value,
        )
        drain_async_logging()


def _resolve_project_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "pnpm-workspace.yaml").is_file() and (parent / "plugins").is_dir():
            return parent
    raise RuntimeError("Unable to resolve Arclayer project root for Connector worker")
