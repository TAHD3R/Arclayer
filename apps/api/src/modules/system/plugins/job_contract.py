from __future__ import annotations

import hashlib
from typing import Final, Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.models.system.plugin_installation import PluginOperationKind, PluginSourceType
from src.modules.jobs.execution_errors import JOB_WORKER_LOST_ERROR_CODE
from src.modules.jobs.registry import (
    COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobResultSemanticContext,
    JobTargetScope,
    JobTerminalErrorContract,
    JobTypeDefinition,
    JobVisibility,
)
from src.modules.jobs.retry import JobRetryPolicy
from src.settings.env_models import BackgroundJobExecutionSettings

PLUGIN_LIFECYCLE_JOB_TYPE: Final = "system.plugin.lifecycle"
PLUGIN_LIFECYCLE_JOB_TYPE_VERSION: Final = 2
PLUGIN_LIFECYCLE_TASK_NAME: Final = "jobs:maintenance:system-plugin-lifecycle:v2"

PLUGIN_OPERATION_NOT_FOUND_CODE: Final = "PLUGIN_OPERATION_NOT_FOUND"
PLUGIN_PACKAGE_CHANGED_CODE: Final = "PLUGIN_PACKAGE_CHANGED"
PLUGIN_PACKAGE_INCOMPATIBLE_CODE: Final = "PLUGIN_PACKAGE_INCOMPATIBLE"
PLUGIN_PACKAGE_INVALID_CODE: Final = "PLUGIN_PACKAGE_INVALID"
PLUGIN_CATALOG_UNAVAILABLE_CODE: Final = "PLUGIN_CATALOG_UNAVAILABLE"
PLUGIN_OPERATION_STATE_INVALID_CODE: Final = "PLUGIN_OPERATION_STATE_INVALID"

PLUGIN_LIFECYCLE_RETRYABLE_CODES: Final = frozenset({
    JOB_WORKER_LOST_ERROR_CODE,
    PLUGIN_CATALOG_UNAVAILABLE_CODE,
})
PLUGIN_LIFECYCLE_TERMINAL_ERROR_CONTRACTS: Final = (
    *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobTerminalErrorContract(code=PLUGIN_OPERATION_NOT_FOUND_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=PLUGIN_PACKAGE_CHANGED_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=PLUGIN_PACKAGE_INCOMPATIBLE_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=PLUGIN_PACKAGE_INVALID_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=PLUGIN_CATALOG_UNAVAILABLE_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=PLUGIN_OPERATION_STATE_INVALID_CODE, metadata_schema=None),
)


class PluginLifecycleJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    operation_id: PublicUUID
    plugin_name: str = Field(..., min_length=1, max_length=128)


class PluginLifecycleJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    operation_id: PublicUUID
    plugin_name: str = Field(..., min_length=1, max_length=128)
    kind: PluginOperationKind
    artifact_id: PublicUUID | None = None
    source_type: PluginSourceType
    source_locator: str = Field(..., min_length=1, max_length=1024)
    target_version: str | None = Field(default=None, max_length=64)
    artifact_checksum: str = Field(..., min_length=71, max_length=80)
    package_checksum: str = Field(..., min_length=71, max_length=80)
    manifest_digest: str = Field(..., min_length=71, max_length=80)
    signer_fingerprint: str | None = Field(default=None, min_length=64, max_length=64)
    desired_enabled: bool


class PluginLifecycleJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["system_plugin_lifecycle"] = "system_plugin_lifecycle"
    operation_id: PublicUUID
    plugin_name: str
    operation_kind: PluginOperationKind
    installed_version: str | None = None
    desired_enabled: bool
    activation_verified: bool


def validate_plugin_lifecycle_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    parsed_target = PluginLifecycleJobTarget.model_validate(target)
    parsed_input = PluginLifecycleJobInput.model_validate(input_reference)
    if parsed_target.operation_id != parsed_input.operation_id or parsed_target.plugin_name != parsed_input.plugin_name:
        raise ValueError("plugin lifecycle Job target and input must reference the same operation")


def validate_plugin_lifecycle_result(context: JobResultSemanticContext) -> None:
    target = PluginLifecycleJobTarget.model_validate(context.target)
    input_reference = PluginLifecycleJobInput.model_validate(context.input_reference)
    result = PluginLifecycleJobResult.model_validate(context.result_reference)
    if result.operation_id != target.operation_id or result.operation_id != input_reference.operation_id:
        raise ValueError("plugin lifecycle result must reference the Job operation")
    if result.plugin_name != target.plugin_name or result.plugin_name != input_reference.plugin_name:
        raise ValueError("plugin lifecycle result must reference the Job plugin")
    if result.operation_kind != input_reference.kind:
        raise ValueError("plugin lifecycle result must preserve the requested operation kind")
    if not result.activation_verified:
        raise ValueError("plugin lifecycle Job cannot succeed before runtime activation is verified")


def build_plugin_lifecycle_source_revision(job_input: PluginLifecycleJobInput) -> str:
    version = job_input.target_version or "none"
    identity = ":".join((
        str(job_input.artifact_id or "bundled"),
        job_input.source_locator,
        job_input.artifact_checksum,
        job_input.package_checksum,
        job_input.manifest_digest,
    ))
    digest = hashlib.sha256(identity.encode()).hexdigest()
    return f"system-plugin:{job_input.plugin_name}:{job_input.kind}:v{version}:{digest}"


def build_plugin_lifecycle_job_definition(*, execution_policy: BackgroundJobExecutionSettings) -> JobTypeDefinition:
    return JobTypeDefinition(
        job_type=PLUGIN_LIFECYCLE_JOB_TYPE,
        job_type_version=PLUGIN_LIFECYCLE_JOB_TYPE_VERSION,
        task_name=PLUGIN_LIFECYCLE_TASK_NAME,
        workload_class=JobWorkloadClass.MAINTENANCE,
        target_scope=JobTargetScope.SYSTEM,
        visibility=JobVisibility.SYSTEM,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        initial_phase="queued",
        initial_status_key="PLUGIN_OPERATION_STATUS_QUEUED",
        phases=frozenset({
            "queued",
            "verifying_package",
            "staging",
            "waiting_for_restart",
            "verifying_activation",
            "finalizing",
        }),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=execution_policy.max_attempts,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
            retryable_codes=PLUGIN_LIFECYCLE_RETRYABLE_CODES,
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="system-plugin-lifecycle",
        target_schema=PluginLifecycleJobTarget,
        input_reference_schema=PluginLifecycleJobInput,
        result_reference_schema=PluginLifecycleJobResult,
        cross_field_validator=validate_plugin_lifecycle_target_input,
        result_semantic_validator=validate_plugin_lifecycle_result,
        terminal_error_contracts=PLUGIN_LIFECYCLE_TERMINAL_ERROR_CONTRACTS,
    )
