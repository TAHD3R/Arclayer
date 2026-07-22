from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.config import Settings
from src.models.jobs.background_job import JobWorkloadClass
from src.platform.jobs.composition.scheduler import MaintenanceSchedulerRuntime, build_scheduler_runtime
from src.platform.jobs.provider_effect_recovery import (
    PROVIDER_EFFECT_RECOVERY_SCAN_SCHEDULE_ID,
    PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME,
)

pytestmark = pytest.mark.unit


class _LeaderLease:
    async def acquire_or_renew(self) -> bool:
        return True

    async def release(self) -> None:
        return None

    async def close(self) -> None:
        return None


async def test_scheduler_runtime_owns_only_the_maintenance_stream() -> None:
    settings = Settings(
        app_env="test",
        database={"enabled": False},
        taskiq={
            "stream_prefix": "arclayer:scheduler-test",
            "consumer_group_prefix": "arclayer:scheduler-test:groups",
            "redis_dsn": "redis://127.0.0.1:6379/15",
        },
    )

    runtime = build_scheduler_runtime(
        settings=settings,
        scheduler_identity="unit-scheduler",
        leader_lease=_LeaderLease(),
    )

    assert runtime.workload_class is JobWorkloadClass.MAINTENANCE
    assert runtime.broker.queue_name == "arclayer:scheduler-test:maintenance"
    assert runtime.broker.consumer_group_name == "arclayer:scheduler-test:groups:maintenance"
    assert runtime.scheduler.broker is runtime.broker
    assert len(runtime.scheduler.sources) == 1
    assert runtime.control_task_names == (PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME,)
    assert set(runtime.broker.local_task_registry) == {PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME}
    source = runtime.scheduler.sources[0]
    await source.startup()
    schedules = await source.get_schedules()
    assert len(schedules) == 1
    assert schedules[0].task_name == PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME
    assert schedules[0].schedule_id == PROVIDER_EFFECT_RECOVERY_SCAN_SCHEDULE_ID
    assert schedules[0].interval == 60

    with pytest.raises(ValidationError) as extra:
        MaintenanceSchedulerRuntime.model_validate({
            "workload_class": runtime.workload_class,
            "broker": runtime.broker,
            "scheduler": runtime.scheduler,
            "control_task_names": runtime.control_task_names,
            "unexpected": object(),
        })
    assert extra.value.errors()[0]["type"] == "extra_forbidden"

    with pytest.raises(ValidationError) as frozen:
        setattr(runtime, "scheduler", runtime.scheduler)  # noqa: B010 - verifies the frozen runtime contract
    assert frozen.value.errors()[0]["type"] == "frozen_instance"
