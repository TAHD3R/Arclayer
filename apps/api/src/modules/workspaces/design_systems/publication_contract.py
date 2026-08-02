from __future__ import annotations

from typing import Final

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.jobs.actor_authorizer import ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS
from src.modules.jobs.execution_errors import JOB_WORKER_LOST_ERROR_CODE
from src.modules.jobs.registry import (
    COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobPermissionRequirement,
    JobPermissionScope,
    JobResultSemanticContext,
    JobTargetScope,
    JobTerminalErrorContract,
    JobTypeDefinition,
    JobVisibility,
)
from src.modules.jobs.retry import JobRetryPolicy
from src.modules.jobs.target_resolver import WORKSPACE_JOB_TARGET_TERMINAL_ERROR_CONTRACTS
from src.settings.env_models import BackgroundJobExecutionSettings

DESIGN_SYSTEM_COMPILE_JOB_TYPE: Final = "design_system.compile"
DESIGN_SYSTEM_COMPILE_JOB_TYPE_VERSION: Final = 1
DESIGN_SYSTEM_COMPILE_JOB_TASK_NAME: Final = "jobs:publish:design-system-compile:v1"
DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE: Final = "DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE"
DESIGN_SYSTEM_PUBLICATION_TRANSIENT_FAILURE: Final = "DESIGN_SYSTEM_PUBLICATION_TRANSIENT_FAILURE"
DESIGN_SYSTEM_PUBLICATION_FAILED: Final = "DESIGN_SYSTEM_PUBLICATION_FAILED"


class DesignSystemCompileJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    design_system_id: PublicUUID
    version_id: PublicUUID


class DesignSystemCompileJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    publication_id: PublicUUID
    manifest_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    validator_version: int = Field(ge=1)
    component_catalog_version: str | None = Field(default=None, max_length=128)
    compiler_version: str = Field(min_length=1, max_length=64)
    renderer_profile: str = Field(min_length=1, max_length=64)
    renderer_version: str = Field(min_length=1, max_length=32)
    asset_pins_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class DesignSystemCompileJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    publication_id: PublicUUID
    artifact_id: PublicUUID
    artifact_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    status: str = Field(pattern=r"^published$")


class DesignSystemPublicationFailureMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    public_error_code: str = Field(min_length=1, max_length=96)


DESIGN_SYSTEM_COMPILE_TERMINAL_ERROR_CONTRACTS: Final = tuple(
    sorted(
        (
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            *WORKSPACE_JOB_TARGET_TERMINAL_ERROR_CONTRACTS,
            *ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS,
            JobTerminalErrorContract(
                code=DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE,
                metadata_schema=DesignSystemPublicationFailureMetadata,
            ),
            JobTerminalErrorContract(
                code=DESIGN_SYSTEM_PUBLICATION_TRANSIENT_FAILURE,
                metadata_schema=DesignSystemPublicationFailureMetadata,
            ),
            JobTerminalErrorContract(
                code=DESIGN_SYSTEM_PUBLICATION_FAILED,
                metadata_schema=DesignSystemPublicationFailureMetadata,
            ),
            JobTerminalErrorContract(code="DESIGN_SYSTEM_ASSET_INVALID", metadata_schema=None),
            JobTerminalErrorContract(code="DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE", metadata_schema=None),
            JobTerminalErrorContract(code="DESIGN_SYSTEM_VALIDATION_BLOCKED", metadata_schema=None),
        ),
        key=lambda contract: contract.code,
    )
)


def build_design_system_compile_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    permission = JobPermissionRequirement(
        scope=JobPermissionScope.WORKSPACE,
        action="system:site:manage",
    )
    return JobTypeDefinition(
        job_type=DESIGN_SYSTEM_COMPILE_JOB_TYPE,
        job_type_version=DESIGN_SYSTEM_COMPILE_JOB_TYPE_VERSION,
        task_name=DESIGN_SYSTEM_COMPILE_JOB_TASK_NAME,
        workload_class=JobWorkloadClass.PUBLISH,
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.OWNER_ONLY,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=permission,
        commercial_effects=frozenset({RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT}),
        manage_permission=permission,
        initial_phase="queued",
        initial_status_key="DESIGN_SYSTEM_PUBLICATION_STATUS_QUEUED",
        phases=frozenset({"queued", "pinning_assets", "compiling", "verifying", "finalizing"}),
        cancellable_phases=frozenset(),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=execution_policy.max_attempts,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
            retryable_codes=frozenset({
                JOB_WORKER_LOST_ERROR_CODE,
                DESIGN_SYSTEM_PUBLICATION_TRANSIENT_FAILURE,
            }),
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="design-system-compile",
        target_schema=DesignSystemCompileJobTarget,
        input_reference_schema=DesignSystemCompileJobInput,
        result_reference_schema=DesignSystemCompileJobResult,
        cross_field_validator=_validate_target_input,
        result_semantic_validator=_validate_result_binding,
        terminal_error_contracts=DESIGN_SYSTEM_COMPILE_TERMINAL_ERROR_CONTRACTS,
    )


def _validate_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    if not isinstance(target, DesignSystemCompileJobTarget) or not isinstance(input_reference, DesignSystemCompileJobInput):
        raise TypeError("Design System compilation requires its exact target and input schemas")


def _validate_result_binding(context: JobResultSemanticContext) -> None:
    if not isinstance(context.input_reference, DesignSystemCompileJobInput) or not isinstance(
        context.result_reference, DesignSystemCompileJobResult
    ):
        raise TypeError("Design System compilation result validation requires its exact schemas")
    if context.result_reference.publication_id != context.input_reference.publication_id:
        raise ValueError("Design System compilation result does not belong to its publication")
