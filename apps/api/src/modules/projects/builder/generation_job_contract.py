from __future__ import annotations

from typing import Final

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.jobs.actor_authorizer import ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS
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
from src.modules.jobs.target_resolver import PROJECT_JOB_TARGET_TERMINAL_ERROR_CONTRACTS
from src.settings.env_models import BackgroundJobExecutionSettings

BUILDER_GENERATION_JOB_TYPE: Final = "builder.sitemap.generate"
BUILDER_GENERATION_JOB_TYPE_VERSION: Final = 1
BUILDER_GENERATION_JOB_TASK_NAME: Final = "jobs:agent-io:builder-sitemap-generate:v1"
BUILDER_GENERATION_FAILED_CODE: Final = "BUILDER_GENERATION_FAILED"
BUILDER_WIREFRAME_GENERATION_JOB_TYPE: Final = "builder.wireframe.generate"
BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION: Final = 1
BUILDER_WIREFRAME_GENERATION_JOB_TASK_NAME: Final = "jobs:agent-io:builder-wireframe-generate:v1"
BUILDER_DESIGN_GENERATION_JOB_TYPE: Final = "builder.design.generate"
BUILDER_DESIGN_GENERATION_JOB_TYPE_VERSION: Final = 1
BUILDER_DESIGN_GENERATION_JOB_TASK_NAME: Final = "jobs:agent-io:builder-design-generate:v1"


class BuilderGenerationJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    project_id: PublicUUID
    runtime_id: PublicUUID
    environment_id: PublicUUID


class BuilderGenerationJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    base_site_revision_id: PublicUUID
    agent_run_id: PublicUUID
    request_hash: str = Field(min_length=64, max_length=64)


class BuilderGenerationJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    base_site_revision_id: PublicUUID
    status: str = Field(pattern=r"^(partial|succeeded)$")
    candidate_change_set_ids: tuple[PublicUUID, ...]
    failed_candidate_count: int = Field(ge=0)


class BuilderWireframeGenerationJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    base_site_revision_id: PublicUUID
    agent_version_id: PublicUUID
    request_hash: str = Field(min_length=64, max_length=64)


class BuilderWireframeGenerationJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    base_site_revision_id: PublicUUID
    status: str = Field(pattern=r"^(partial|succeeded)$")
    candidate_change_set_ids: tuple[PublicUUID, ...]
    failed_candidate_count: int = Field(ge=0)


class BuilderDesignGenerationJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    base_site_revision_id: PublicUUID
    agent_version_id: PublicUUID
    request_hash: str = Field(min_length=64, max_length=64)


class BuilderDesignGenerationJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    base_site_revision_id: PublicUUID
    status: str = Field(pattern=r"^(partial|succeeded)$")
    candidate_change_set_ids: tuple[PublicUUID, ...]
    failed_candidate_count: int = Field(ge=0)


class BuilderGenerationFailureMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    public_error_code: str = Field(min_length=1, max_length=96)
    failed_candidate_count: int = Field(ge=0)


BUILDER_GENERATION_TERMINAL_ERROR_CONTRACTS: Final = tuple(
    sorted(
        (
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            *PROJECT_JOB_TARGET_TERMINAL_ERROR_CONTRACTS,
            *ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS,
            JobTerminalErrorContract(
                code=BUILDER_GENERATION_FAILED_CODE,
                metadata_schema=BuilderGenerationFailureMetadata,
            ),
        ),
        key=lambda contract: contract.code,
    )
)


def build_builder_generation_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    return _build_definition(
        execution_policy=execution_policy,
        job_type=BUILDER_GENERATION_JOB_TYPE,
        job_type_version=BUILDER_GENERATION_JOB_TYPE_VERSION,
        task_name=BUILDER_GENERATION_JOB_TASK_NAME,
        idempotency_namespace="builder-generation",
        input_schema=BuilderGenerationJobInput,
        result_schema=BuilderGenerationJobResult,
        cross_field_validator=_validate_target_input,
        result_semantic_validator=_validate_result_binding,
    )


def build_builder_wireframe_generation_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    return _build_definition(
        execution_policy=execution_policy,
        job_type=BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
        job_type_version=BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION,
        task_name=BUILDER_WIREFRAME_GENERATION_JOB_TASK_NAME,
        idempotency_namespace="builder-wireframe-generation",
        input_schema=BuilderWireframeGenerationJobInput,
        result_schema=BuilderWireframeGenerationJobResult,
        cross_field_validator=_validate_wireframe_target_input,
        result_semantic_validator=_validate_wireframe_result_binding,
    )


def build_builder_design_generation_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    return _build_definition(
        execution_policy=execution_policy,
        job_type=BUILDER_DESIGN_GENERATION_JOB_TYPE,
        job_type_version=BUILDER_DESIGN_GENERATION_JOB_TYPE_VERSION,
        task_name=BUILDER_DESIGN_GENERATION_JOB_TASK_NAME,
        idempotency_namespace="builder-design-generation",
        input_schema=BuilderDesignGenerationJobInput,
        result_schema=BuilderDesignGenerationJobResult,
        cross_field_validator=_validate_design_target_input,
        result_semantic_validator=_validate_design_result_binding,
    )


def _build_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
    job_type: str,
    job_type_version: int,
    task_name: str,
    idempotency_namespace: str,
    input_schema: type[BaseSchema],
    result_schema: type[BaseSchema],
    cross_field_validator,
    result_semantic_validator,
) -> JobTypeDefinition:
    permission = JobPermissionRequirement(
        scope=JobPermissionScope.PROJECT,
        action="project:content:site-builder:write",
    )
    return JobTypeDefinition(
        job_type=job_type,
        job_type_version=job_type_version,
        task_name=task_name,
        workload_class=JobWorkloadClass.AGENT_IO,
        target_scope=JobTargetScope.PROJECT,
        visibility=JobVisibility.OWNER_ONLY,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=permission,
        commercial_effects=frozenset({RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT}),
        manage_permission=permission,
        initial_phase="queued",
        initial_status_key="BUILDER_GENERATION_STATUS_QUEUED",
        phases=frozenset({"queued", "preparing", "generating", "previewing", "finalizing"}),
        cancellable_phases=frozenset({"queued", "preparing", "generating", "previewing", "finalizing"}),
        retry_class=JobRetryClass.NONE,
        retry_policy=JobRetryPolicy(
            max_attempts=1,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace=idempotency_namespace,
        target_schema=BuilderGenerationJobTarget,
        input_reference_schema=input_schema,
        result_reference_schema=result_schema,
        cross_field_validator=cross_field_validator,
        result_semantic_validator=result_semantic_validator,
        terminal_error_contracts=BUILDER_GENERATION_TERMINAL_ERROR_CONTRACTS,
    )


def _validate_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    if not isinstance(target, BuilderGenerationJobTarget) or not isinstance(input_reference, BuilderGenerationJobInput):
        raise TypeError("Builder generation requires its exact target and input schemas")


def _validate_result_binding(context: JobResultSemanticContext) -> None:
    if not isinstance(context.input_reference, BuilderGenerationJobInput) or not isinstance(
        context.result_reference, BuilderGenerationJobResult
    ):
        raise TypeError("Builder generation result validation requires its exact schemas")
    if (
        context.result_reference.generation_id != context.input_reference.generation_id
        or context.result_reference.base_site_revision_id != context.input_reference.base_site_revision_id
    ):
        raise ValueError("Builder generation result does not belong to its canonical input")


def _validate_wireframe_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    if not isinstance(target, BuilderGenerationJobTarget) or not isinstance(
        input_reference, BuilderWireframeGenerationJobInput
    ):
        raise TypeError("Builder Wireframe generation requires its exact target and input schemas")


def _validate_wireframe_result_binding(context: JobResultSemanticContext) -> None:
    if not isinstance(context.input_reference, BuilderWireframeGenerationJobInput) or not isinstance(
        context.result_reference, BuilderWireframeGenerationJobResult
    ):
        raise TypeError("Builder Wireframe generation result validation requires its exact schemas")
    if (
        context.result_reference.generation_id != context.input_reference.generation_id
        or context.result_reference.base_site_revision_id != context.input_reference.base_site_revision_id
    ):
        raise ValueError("Builder Wireframe generation result does not belong to its canonical input")


def _validate_design_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    if not isinstance(target, BuilderGenerationJobTarget) or not isinstance(
        input_reference, BuilderDesignGenerationJobInput
    ):
        raise TypeError("Builder Design generation requires its exact target and input schemas")


def _validate_design_result_binding(context: JobResultSemanticContext) -> None:
    if not isinstance(context.input_reference, BuilderDesignGenerationJobInput) or not isinstance(
        context.result_reference, BuilderDesignGenerationJobResult
    ):
        raise TypeError("Builder Design generation result validation requires its exact schemas")
    if (
        context.result_reference.generation_id != context.input_reference.generation_id
        or context.result_reference.base_site_revision_id != context.input_reference.base_site_revision_id
    ):
        raise ValueError("Builder Design generation result does not belong to its canonical input")
