from __future__ import annotations

import threading

import pytest
from pydantic import ValidationError

from src.agents.checkpointing import memory_agent_checkpointer
from src.config import Settings
from src.core import logging as app_logging
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.commerce.access_state.fact_consumer_job_contract import COMMERCE_ACCESS_FACT_CONSUME_TASK_NAME
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.system.admin.notifications.campaign_job_contract import NOTIFICATION_CAMPAIGN_DISPATCH_TASK_NAME
from src.modules.system.plugins.job_contract import PLUGIN_LIFECYCLE_TASK_NAME
from src.platform.jobs.provider_effect_recovery import PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME
from src.platform.jobs.workers import factory as worker_factory
from src.platform.jobs.workers.factory import (
    WorkloadWorkerRuntime,
    build_configured_workload_worker_runtime,
    build_workload_worker_runtime,
)

pytestmark = pytest.mark.unit


def _settings(tmp_path) -> Settings:
    return Settings(
        app_env="test",
        database={"enabled": False},
        storage={
            "local_root_dir": tmp_path / "objects",
            "local_tmp_dir": tmp_path / "scratch",
        },
        logging={
            "async_enabled": True,
            "json_logs": False,
            "log_dir": tmp_path / "logs",
        },
        taskiq={
            "enabled": True,
            "stream_prefix": "arclayer:worker-test",
            "consumer_group_prefix": "arclayer:worker-test:groups",
            "redis_dsn": "redis://127.0.0.1:6379/15",
        },
    )


def test_asset_cpu_worker_registers_only_its_exact_durable_task(tmp_path) -> None:
    runtime = build_workload_worker_runtime(
        settings=_settings(tmp_path),
        workload_class=JobWorkloadClass.ASSET_CPU,
        consumer_identity="unit-worker",
    )

    assert runtime.broker.queue_name == "arclayer:worker-test:asset-cpu"
    assert runtime.broker.consumer_group_name == "arclayer:worker-test:groups:asset-cpu"
    assert set(runtime.broker.local_task_registry) == {
        "jobs:asset-cpu:asset-thumbnail-generate:v1",
    }
    assert len(runtime.worker_registry.manifest) == 1
    assert runtime.execution.executor.handlers is runtime.execution.handlers
    assert runtime.workload_class is JobWorkloadClass.ASSET_CPU

    with pytest.raises(ValidationError) as extra:
        WorkloadWorkerRuntime.model_validate({
            "workload_class": runtime.workload_class,
            "broker": runtime.broker,
            "worker_registry": runtime.worker_registry,
            "execution": runtime.execution,
            "unexpected": object(),
        })
    assert extra.value.errors()[0]["type"] == "extra_forbidden"

    with pytest.raises(ValidationError) as frozen:
        setattr(runtime, "execution", runtime.execution)  # noqa: B010 - verifies the frozen runtime contract
    assert frozen.value.errors()[0]["type"] == "frozen_instance"


def test_agent_io_worker_registers_only_its_normalized_durable_tasks(tmp_path) -> None:
    runtime = build_workload_worker_runtime(
        settings=_settings(tmp_path),
        workload_class=JobWorkloadClass.AGENT_IO,
        consumer_identity="unit-worker",
        agent_checkpointer_factory=memory_agent_checkpointer,
    )

    assert runtime.broker.queue_name == "arclayer:worker-test:agent-io"
    assert runtime.broker.consumer_group_name == "arclayer:worker-test:groups:agent-io"
    assert set(runtime.broker.local_task_registry) == {
        "jobs:agent-io:agent-run-execute:v1",
        "jobs:agent-io:builder-design-generate:v1",
        "jobs:agent-io:builder-planning-generate:v1",
        "jobs:agent-io:builder-sitemap-generate:v1",
        "jobs:agent-io:builder-wireframe-generate:v1",
        "jobs:agent-io:design-system-concept-generate:v1",
        "jobs:agent-io:knowledge-source-index:v1",
    }
    assert len(runtime.worker_registry.manifest) == 7
    assert runtime.workload_class is JobWorkloadClass.AGENT_IO


def test_connector_worker_registers_billing_knowledge_and_github_skill_workloads(tmp_path) -> None:
    runtime = build_workload_worker_runtime(
        settings=_settings(tmp_path),
        workload_class=JobWorkloadClass.CONNECTOR,
        consumer_identity="unit-worker",
    )

    assert runtime.broker.queue_name == "arclayer:worker-test:connector"
    assert set(runtime.broker.local_task_registry) == {
        "jobs:connector:billing-event-process:v1",
        "jobs:connector:knowledge-source-ingest:v1",
        "jobs:connector:skill-github-import:v2",
        "jobs:connector:skill-github-refresh:v2",
    }
    assert len(runtime.worker_registry.manifest) == 4
    assert runtime.extension_manager is not None
    billing_handler = runtime.execution.handlers.create_handler(
        job_type="billing.connector-event.process",
        job_type_version=1,
    )
    assert isinstance(billing_handler, BillingConnectorEventJobHandler)
    assert billing_handler._connectors is runtime.extension_manager.registry.connectors


def test_maintenance_worker_registers_durable_recovery_and_scheduled_scan_control(tmp_path) -> None:
    runtime = build_workload_worker_runtime(
        settings=_settings(tmp_path),
        workload_class=JobWorkloadClass.MAINTENANCE,
        consumer_identity="unit-worker",
    )

    assert set(runtime.broker.local_task_registry) == {
        COMMERCE_ACCESS_FACT_CONSUME_TASK_NAME,
        NOTIFICATION_CAMPAIGN_DISPATCH_TASK_NAME,
        PLUGIN_LIFECYCLE_TASK_NAME,
        "jobs:maintenance:provider-effect-orphan-reconcile:v1",
        PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME,
    }
    assert len(runtime.worker_registry.manifest) == 4
    assert runtime.control_task_names == (PROVIDER_EFFECT_RECOVERY_SCAN_TASK_NAME,)


def test_configured_worker_identity_still_includes_the_child_process_pid(monkeypatch, tmp_path) -> None:
    settings = _settings(tmp_path).model_copy(
        update={
            "taskiq": _settings(tmp_path).taskiq.model_copy(
                update={"consumer_identity": "pod-a"},
            )
        }
    )
    monkeypatch.setattr(worker_factory, "get_settings", lambda: settings)
    monkeypatch.setattr(worker_factory.os, "getpid", lambda: 4242)

    runtime = build_configured_workload_worker_runtime(JobWorkloadClass.ASSET_CPU)

    assert runtime.broker.consumer_name == "pod-a:4242:asset-cpu"


async def test_worker_shutdown_drains_async_logging_before_returning(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("LOGGING__ASYNC_ENABLED", "1")
    settings = _settings(tmp_path)
    runtime = build_workload_worker_runtime(
        settings=settings,
        workload_class=JobWorkloadClass.MAINTENANCE,
        consumer_identity="unit-worker",
    )
    assert settings.logging.async_enabled is True
    app_logging.configure_logging(settings)
    listener_threads = {thread for thread in threading.enumerate() if thread.name.endswith("(_monitor)")}

    try:
        assert len(listener_threads) == 1
        runtime.broker.is_worker_process = True

        await runtime.broker.shutdown()

        assert all(not thread.is_alive() for thread in listener_threads)
    finally:
        app_logging.drain_async_logging()
