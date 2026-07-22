from __future__ import annotations

import os
import socket

from pydantic import ConfigDict
from taskiq.schedule_sources import LabelScheduleSource
from taskiq.scheduler.scheduler import TaskiqScheduler

from src.common.schemas import BaseSchema
from src.config import Settings, get_settings
from src.models.jobs.background_job import JobWorkloadClass
from src.platform.jobs.durable.ack import DurableRedisStreamBroker
from src.platform.jobs.durable.brokers import (
    build_taskiq_workload_broker,
    build_taskiq_workload_manifest,
    workload_broker_tuning_from_settings,
)
from src.platform.jobs.provider_effect_recovery import (
    PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME,
    register_provider_effect_recovery_scan,
)
from src.platform.jobs.scheduler_leader import (
    LeaderScheduleSource,
    RedisSchedulerLeaderLease,
    SchedulerLeaderLease,
)


class MaintenanceSchedulerRuntime(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    workload_class: JobWorkloadClass
    broker: DurableRedisStreamBroker
    scheduler: TaskiqScheduler
    control_task_names: tuple[str, ...]


def build_scheduler_runtime(
    *,
    settings: Settings,
    scheduler_identity: str,
    leader_lease: SchedulerLeaderLease | None = None,
) -> MaintenanceSchedulerRuntime:
    workload = JobWorkloadClass.MAINTENANCE
    route = build_taskiq_workload_manifest(settings).route_for(workload)
    broker = build_taskiq_workload_broker(
        settings,
        route=route,
        consumer_identity=scheduler_identity,
        tuning=workload_broker_tuning_from_settings(
            settings,
            workload_class=workload,
        ),
    )
    register_provider_effect_recovery_scan(broker=broker, settings=settings)
    lease = leader_lease or RedisSchedulerLeaderLease(
        dsn=settings.taskiq.redis_dsn or settings.valkey.dsn,
        key=f"{settings.taskiq.stream_prefix}:scheduler-leader:{workload.value}",
        token=scheduler_identity,
        ttl_seconds=settings.taskiq.scheduler_leader_lease_seconds,
    )
    source = LeaderScheduleSource(
        inner=LabelScheduleSource(broker),
        lease=lease,
    )
    scheduler = TaskiqScheduler(
        broker=broker,
        sources=[source],
    )
    return MaintenanceSchedulerRuntime(
        workload_class=workload,
        broker=broker,
        scheduler=scheduler,
        control_task_names=(PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME,),
    )


_settings = get_settings()
_configured_identity = _settings.taskiq.consumer_identity
_identity_prefix = _configured_identity or socket.gethostname()
_scheduler_identity = f"{_identity_prefix}:{os.getpid()}:scheduler"
runtime = build_scheduler_runtime(
    settings=_settings,
    scheduler_identity=_scheduler_identity,
)
broker = runtime.broker
scheduler = runtime.scheduler
