from __future__ import annotations

from typing import Final

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.jobs.registry import (
    JobPermissionRequirement,
    JobPermissionScope,
    JobResultSemanticContext,
    JobTargetScope,
    JobTypeDefinition,
    JobVisibility,
)
from src.modules.jobs.retry import JobRetryPolicy
from src.modules.projects.builder.generation_job_contract import (
    BUILDER_GENERATION_TERMINAL_ERROR_CONTRACTS,
    BuilderGenerationJobTarget,
)
from src.settings.env_models import BackgroundJobExecutionSettings

BUILDER_PLANNING_GENERATION_JOB_TYPE: Final = "builder.planning.generate"
BUILDER_PLANNING_GENERATION_JOB_TYPE_VERSION: Final = 1
BUILDER_PLANNING_GENERATION_JOB_TASK_NAME: Final = "jobs:agent-io:builder-planning-generate:v1"


class BuilderPlanningGenerationJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    saga_id: PublicUUID
    generation_id: PublicUUID
    base_site_revision_id: PublicUUID
    agent_version_id: PublicUUID
    request_hash: str = Field(min_length=64, max_length=64)


class BuilderPlanningGenerationJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    saga_id: PublicUUID
    generation_id: PublicUUID
    base_site_revision_id: PublicUUID
    status: str = Field(pattern=r"^(partial|succeeded)$")
    candidate_change_set_ids: tuple[PublicUUID, ...]
    failed_candidate_count: int = Field(ge=0)


def build_builder_planning_generation_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    permission = JobPermissionRequirement(
        scope=JobPermissionScope.PROJECT,
        action="project:content:site-builder:write",
    )
    return JobTypeDefinition(
        job_type=BUILDER_PLANNING_GENERATION_JOB_TYPE,
        job_type_version=BUILDER_PLANNING_GENERATION_JOB_TYPE_VERSION,
        task_name=BUILDER_PLANNING_GENERATION_JOB_TASK_NAME,
        workload_class=JobWorkloadClass.AGENT_IO,
        target_scope=JobTargetScope.PROJECT,
        visibility=JobVisibility.OWNER_ONLY,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=permission,
        commercial_effects=frozenset({RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT}),
        manage_permission=permission,
        initial_phase="queued",
        initial_status_key="BUILDER_PLANNING_GENERATION_STATUS_QUEUED",
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
        idempotency_namespace="builder-planning-generation",
        target_schema=BuilderGenerationJobTarget,
        input_reference_schema=BuilderPlanningGenerationJobInput,
        result_reference_schema=BuilderPlanningGenerationJobResult,
        cross_field_validator=_validate_target_input,
        result_semantic_validator=_validate_result_binding,
        terminal_error_contracts=BUILDER_GENERATION_TERMINAL_ERROR_CONTRACTS,
    )


def _validate_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    if not isinstance(target, BuilderGenerationJobTarget) or not isinstance(
        input_reference, BuilderPlanningGenerationJobInput
    ):
        raise TypeError("Builder planning generation requires its exact target and input schemas")


def _validate_result_binding(context: JobResultSemanticContext) -> None:
    if not isinstance(context.input_reference, BuilderPlanningGenerationJobInput) or not isinstance(
        context.result_reference, BuilderPlanningGenerationJobResult
    ):
        raise TypeError("Builder planning generation result validation requires its exact schemas")
    if (
        context.result_reference.saga_id != context.input_reference.saga_id
        or context.result_reference.generation_id != context.input_reference.generation_id
        or context.result_reference.base_site_revision_id != context.input_reference.base_site_revision_id
    ):
        raise ValueError("Builder planning generation result does not belong to its canonical input")


__all__ = [
    "BUILDER_PLANNING_GENERATION_JOB_TASK_NAME",
    "BUILDER_PLANNING_GENERATION_JOB_TYPE",
    "BUILDER_PLANNING_GENERATION_JOB_TYPE_VERSION",
    "BuilderPlanningGenerationJobInput",
    "BuilderPlanningGenerationJobResult",
    "build_builder_planning_generation_job_definition",
]
