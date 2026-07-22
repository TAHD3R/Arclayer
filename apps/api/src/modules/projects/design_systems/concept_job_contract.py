from __future__ import annotations

from typing import Final

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
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

DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE: Final = "design_system.concept.generate"
DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE_VERSION: Final = 1
DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TASK_NAME: Final = "jobs:agent-io:design-system-concept-generate:v1"
DESIGN_SYSTEM_CONCEPT_GENERATION_FAILED_CODE: Final = "DESIGN_SYSTEM_CONCEPT_GENERATION_FAILED"


class DesignSystemConceptGenerationJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    project_id: PublicUUID
    design_system_id: PublicUUID


class DesignSystemConceptGenerationJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    base_version_id: PublicUUID
    base_site_revision_id: PublicUUID
    agent_run_id: PublicUUID | None = None
    agent_version_id: PublicUUID
    request_hash: str = Field(min_length=64, max_length=64)


class DesignSystemConceptGenerationJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    base_version_id: PublicUUID
    status: str = Field(pattern=r"^(partial|succeeded)$")
    candidate_version_ids: tuple[PublicUUID, ...]
    failed_candidate_count: int = Field(ge=0)


class DesignSystemConceptGenerationFailureMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    public_error_code: str = Field(min_length=1, max_length=96)
    failed_candidate_count: int = Field(ge=0)


DESIGN_SYSTEM_CONCEPT_GENERATION_TERMINAL_ERROR_CONTRACTS: Final = tuple(
    sorted(
        (
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            *PROJECT_JOB_TARGET_TERMINAL_ERROR_CONTRACTS,
            *ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS,
            JobTerminalErrorContract(
                code=DESIGN_SYSTEM_CONCEPT_GENERATION_FAILED_CODE,
                metadata_schema=DesignSystemConceptGenerationFailureMetadata,
            ),
        ),
        key=lambda contract: contract.code,
    )
)


def build_design_system_concept_generation_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    permission = JobPermissionRequirement(
        scope=JobPermissionScope.PROJECT,
        action="project:content:site-builder:write",
    )
    return JobTypeDefinition(
        job_type=DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE,
        job_type_version=DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE_VERSION,
        task_name=DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TASK_NAME,
        workload_class=JobWorkloadClass.AGENT_IO,
        target_scope=JobTargetScope.PROJECT,
        visibility=JobVisibility.OWNER_ONLY,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=permission,
        manage_permission=permission,
        initial_phase="queued",
        initial_status_key="DESIGN_SYSTEM_CONCEPT_GENERATION_STATUS_QUEUED",
        phases=frozenset({"queued", "preparing", "generating", "validating", "finalizing"}),
        cancellable_phases=frozenset({"queued", "preparing", "generating", "validating", "finalizing"}),
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
        idempotency_namespace="design-system-concept-generation",
        target_schema=DesignSystemConceptGenerationJobTarget,
        input_reference_schema=DesignSystemConceptGenerationJobInput,
        result_reference_schema=DesignSystemConceptGenerationJobResult,
        cross_field_validator=_validate_target_input,
        result_semantic_validator=_validate_result_binding,
        terminal_error_contracts=DESIGN_SYSTEM_CONCEPT_GENERATION_TERMINAL_ERROR_CONTRACTS,
    )


def _validate_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    if not isinstance(target, DesignSystemConceptGenerationJobTarget) or not isinstance(
        input_reference, DesignSystemConceptGenerationJobInput
    ):
        raise TypeError("Design System concept generation requires its exact target and input schemas")


def _validate_result_binding(context: JobResultSemanticContext) -> None:
    if not isinstance(context.input_reference, DesignSystemConceptGenerationJobInput) or not isinstance(
        context.result_reference, DesignSystemConceptGenerationJobResult
    ):
        raise TypeError("Design System concept generation result validation requires its exact schemas")
    if (
        context.result_reference.generation_id != context.input_reference.generation_id
        or context.result_reference.base_version_id != context.input_reference.base_version_id
    ):
        raise ValueError("Design System concept generation result does not belong to its canonical input")
