from __future__ import annotations

import pytest

from scripts.run_taskiq_worker import build_worker_command
from src.config import Settings
from src.models.jobs.background_job import JobWorkloadClass

pytestmark = pytest.mark.unit


def test_worker_command_uses_exact_root_ack_receiver_and_explicit_process_lifecycle_policy() -> None:
    settings = Settings(
        app_env="test",
        database={"enabled": False},
        taskiq={
            "shutdown_timeout_seconds": 17,
            "wait_tasks_timeout_seconds": 91,
            "workloads": {
                "asset_cpu": {
                    "worker_processes": 2,
                    "max_async_tasks": 3,
                    "max_prefetch": 1,
                }
            },
        },
    )

    command = build_worker_command(
        settings=settings,
        workload_class=JobWorkloadClass.ASSET_CPU,
    )

    assert command == [
        "taskiq",
        "worker",
        "--receiver",
        "src.platform.jobs.durable.ack:DurableAckReceiver",
        "--ack-type",
        "when_saved",
        "--workers",
        "2",
        "--max-async-tasks",
        "3",
        "--max-prefetch",
        "1",
        "--shutdown-timeout",
        "17",
        "--wait-tasks-timeout",
        "91",
        "--max-fails",
        "1",
        "src.platform.jobs.workers.asset_cpu:broker",
        "src.platform.jobs.workers.asset_cpu",
    ]
