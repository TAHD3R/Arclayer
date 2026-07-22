from __future__ import annotations

import asyncio
from typing import cast
from uuid import uuid4

import pytest
from taskiq.exceptions import ScheduledTaskCancelledError

from src.config import get_settings
from src.platform.jobs.composition.scheduler import build_scheduler_runtime
from src.platform.jobs.scheduler_leader import LeaderScheduleSource

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_two_scheduler_sources_expose_one_leader_and_fence_it_after_lease_expiry(
    integration_valkey_settings: str,
) -> None:
    settings = get_settings()
    token = uuid4().hex
    taskiq_settings = settings.taskiq.model_copy(
        update={
            "enabled": True,
            "stream_prefix": f"{integration_valkey_settings}:scheduler-leader:{token}",
            "consumer_group_prefix": f"{integration_valkey_settings}:scheduler-leader-groups:{token}",
            "redis_dsn": settings.valkey.dsn,
            "scheduler_leader_lease_seconds": 3,
        }
    )
    runtime_settings = settings.model_copy(update={"taskiq": taskiq_settings})
    first_runtime = build_scheduler_runtime(
        settings=runtime_settings,
        scheduler_identity=f"scheduler-a:{token}",
    )
    second_runtime = build_scheduler_runtime(
        settings=runtime_settings,
        scheduler_identity=f"scheduler-b:{token}",
    )
    first_source, second_source = (
        cast(LeaderScheduleSource, first_runtime.scheduler.sources[0]),
        cast(LeaderScheduleSource, second_runtime.scheduler.sources[0]),
    )

    await first_source.startup()
    await second_source.startup()
    try:
        first_schedules, second_schedules = await asyncio.gather(
            first_source.get_schedules(),
            second_source.get_schedules(),
        )
        assert sorted((len(first_schedules), len(second_schedules))) == [0, 1]

        leader, follower = (first_source, second_source) if first_schedules else (second_source, first_source)
        leader_schedule = (first_schedules or second_schedules)[0]
        await asyncio.sleep(3.1)
        promoted = await follower.get_schedules()
        assert len(promoted) == 1
        with pytest.raises(ScheduledTaskCancelledError):
            await leader.pre_send(leader_schedule)
    finally:
        await first_source.shutdown()
        await second_source.shutdown()
