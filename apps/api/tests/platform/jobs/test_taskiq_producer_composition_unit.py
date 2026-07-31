from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.config import Settings
from src.models.jobs.background_job import JobWorkloadClass
from src.platform.jobs.composition.producer import DurableJobProducerRuntime, build_producer_runtime

pytestmark = pytest.mark.unit


def test_producer_runtime_registers_global_manifest_on_exact_workload_brokers(tmp_path) -> None:
    settings = Settings(
        app_env="test",
        database={"enabled": False},
        storage={
            "local_root_dir": tmp_path / "objects",
            "local_tmp_dir": tmp_path / "scratch",
        },
        taskiq={
            "stream_prefix": "arclayer:producer-test",
            "consumer_group_prefix": "arclayer:producer-test:groups",
            "redis_dsn": "redis://127.0.0.1:6379/15",
        },
    )

    runtime = build_producer_runtime(
        settings=settings,
        producer_identity="unit-dispatcher",
    )

    assert len(tuple(runtime.brokers.items())) == 6
    assert set(runtime.brokers.select(JobWorkloadClass.AGENT_IO).local_task_registry) == {
        "jobs:agent-io:agent-run-execute:v1",
        "jobs:agent-io:builder-design-generate:v1",
        "jobs:agent-io:builder-planning-generate:v1",
        "jobs:agent-io:builder-sitemap-generate:v1",
        "jobs:agent-io:builder-wireframe-generate:v1",
        "jobs:agent-io:design-system-concept-generate:v1",
        "jobs:agent-io:knowledge-source-index:v1",
    }
    assert set(runtime.brokers.select(JobWorkloadClass.ASSET_CPU).local_task_registry) == {
        "jobs:asset-cpu:asset-thumbnail-generate:v1",
    }
    assert set(runtime.brokers.select(JobWorkloadClass.MAINTENANCE).local_task_registry) == {
        "jobs:maintenance:commerce-access-fact-consume:v1",
        "jobs:maintenance:notification-campaign-dispatch:v1",
        "jobs:maintenance:provider-effect-orphan-reconcile:v1",
        "jobs:maintenance:system-plugin-lifecycle:v2",
    }
    assert set(runtime.brokers.select(JobWorkloadClass.CONNECTOR).local_task_registry) == {
        "jobs:connector:billing-event-process:v1",
        "jobs:connector:knowledge-source-ingest:v1",
        "jobs:connector:skill-github-import:v1",
        "jobs:connector:skill-github-refresh:v1",
    }
    assert len(runtime.registry.manifest) == 16
    assert runtime.transport.registry is runtime.registry

    with pytest.raises(ValidationError) as extra:
        DurableJobProducerRuntime.model_validate({
            "brokers": runtime.brokers,
            "registry": runtime.registry,
            "transport": runtime.transport,
            "dispatch_service": runtime.dispatch_service,
            "unexpected": object(),
        })
    assert extra.value.errors()[0]["type"] == "extra_forbidden"

    with pytest.raises(ValidationError) as frozen:
        setattr(runtime, "transport", runtime.transport)  # noqa: B010 - verifies the frozen runtime contract
    assert frozen.value.errors()[0]["type"] == "frozen_instance"
