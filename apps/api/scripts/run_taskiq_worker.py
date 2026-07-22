from __future__ import annotations

import argparse
import os
import shutil

from src.config import Settings, get_settings
from src.models.jobs.background_job import JobWorkloadClass

_DURABLE_ACK_RECEIVER = "src.platform.jobs.durable.ack:DurableAckReceiver"
# Taskiq exits before restarting when the first child exit reaches this threshold.
_FAIL_FAST_CHILD_EXIT_LIMIT = 1


def build_worker_command(
    *,
    settings: Settings,
    workload_class: JobWorkloadClass,
) -> list[str]:
    module_name = workload_class.value.replace("-", "_")
    configured = getattr(settings.taskiq.workloads, module_name)
    worker_module = f"src.platform.jobs.workers.{module_name}"
    return [
        "taskiq",
        "worker",
        "--receiver",
        _DURABLE_ACK_RECEIVER,
        "--ack-type",
        "when_saved",
        "--workers",
        str(configured.worker_processes),
        "--max-async-tasks",
        str(configured.max_async_tasks),
        "--max-prefetch",
        str(configured.max_prefetch),
        "--shutdown-timeout",
        str(settings.taskiq.shutdown_timeout_seconds),
        "--wait-tasks-timeout",
        str(settings.taskiq.wait_tasks_timeout_seconds),
        "--max-fails",
        str(_FAIL_FAST_CHILD_EXIT_LIMIT),
        f"{worker_module}:broker",
        worker_module,
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Start one exact durable Job workload worker.")
    parser.add_argument(
        "workload",
        choices=[workload.value for workload in JobWorkloadClass],
    )
    args = parser.parse_args()
    workload = JobWorkloadClass(args.workload)
    command = build_worker_command(
        settings=get_settings(),
        workload_class=workload,
    )
    executable = shutil.which(command[0])
    if executable is None:
        raise RuntimeError("The Taskiq worker executable is not installed")
    os.execv(executable, [executable, *command[1:]])


if __name__ == "__main__":
    main()
