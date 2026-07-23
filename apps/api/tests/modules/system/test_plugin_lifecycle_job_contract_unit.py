from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import Settings
from src.models.jobs.background_job import JobWorkloadClass
from src.models.system.plugin_installation import PluginOperationKind, PluginSourceType
from src.modules.jobs.registry import JobResultSemanticContext
from src.modules.system.plugins.job_contract import (
    PLUGIN_LIFECYCLE_JOB_TYPE,
    PluginLifecycleJobInput,
    PluginLifecycleJobResult,
    PluginLifecycleJobTarget,
    build_plugin_lifecycle_job_definition,
    build_plugin_lifecycle_source_revision,
    validate_plugin_lifecycle_result,
    validate_plugin_lifecycle_target_input,
)

pytestmark = pytest.mark.unit


def _job_input() -> PluginLifecycleJobInput:
    return PluginLifecycleJobInput(
        operation_id=uuid4(),
        plugin_name="arclayer-email",
        kind=PluginOperationKind.DISABLE,
        source_type=PluginSourceType.BUNDLED,
        source_locator="plugins/arclayer-email",
        target_version="1.0.0",
        artifact_checksum=f"sha256:{'a' * 64}",
        package_checksum=f"sha256:{'a' * 64}",
        manifest_digest=f"sha256:{'b' * 64}",
        desired_enabled=False,
    )


def test_plugin_lifecycle_definition_is_system_maintenance_job() -> None:
    definition = build_plugin_lifecycle_job_definition(
        execution_policy=Settings(app_env="test", database={"enabled": False}).background_jobs.plugin_lifecycle
    )

    assert definition.job_type == PLUGIN_LIFECYCLE_JOB_TYPE
    assert definition.workload_class == JobWorkloadClass.MAINTENANCE
    assert "waiting_for_restart" in definition.phases
    assert definition.result_reference_schema is PluginLifecycleJobResult


def test_plugin_lifecycle_target_must_match_input() -> None:
    job_input = _job_input()

    with pytest.raises(ValueError, match="same operation"):
        validate_plugin_lifecycle_target_input(
            PluginLifecycleJobTarget(operation_id=uuid4(), plugin_name=job_input.plugin_name),
            job_input,
        )


def test_plugin_lifecycle_result_requires_verified_runtime_activation() -> None:
    job_input = _job_input()
    target = PluginLifecycleJobTarget(
        operation_id=job_input.operation_id,
        plugin_name=job_input.plugin_name,
    )
    result = PluginLifecycleJobResult(
        operation_id=job_input.operation_id,
        plugin_name=job_input.plugin_name,
        operation_kind=job_input.kind,
        installed_version=job_input.target_version,
        desired_enabled=job_input.desired_enabled,
        activation_verified=False,
    )

    with pytest.raises(ValueError, match="cannot succeed"):
        validate_plugin_lifecycle_result(
            JobResultSemanticContext(
                job_id=uuid4(),
                source_revision=build_plugin_lifecycle_source_revision(job_input),
                target=target,
                input_reference=job_input,
                result_reference=result,
            )
        )


def test_plugin_lifecycle_verified_result_preserves_operation_identity() -> None:
    job_input = _job_input()
    target = PluginLifecycleJobTarget(
        operation_id=job_input.operation_id,
        plugin_name=job_input.plugin_name,
    )
    result = PluginLifecycleJobResult(
        operation_id=job_input.operation_id,
        plugin_name=job_input.plugin_name,
        operation_kind=job_input.kind,
        installed_version=job_input.target_version,
        desired_enabled=job_input.desired_enabled,
        activation_verified=True,
    )

    validate_plugin_lifecycle_result(
        JobResultSemanticContext(
            job_id=uuid4(),
            source_revision=build_plugin_lifecycle_source_revision(job_input),
            target=target,
            input_reference=job_input,
            result_reference=result,
        )
    )
