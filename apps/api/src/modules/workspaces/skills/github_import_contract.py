from __future__ import annotations

from typing import Final, Literal, cast

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.jobs.actor_authorizer import ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS
from src.modules.jobs.execution_errors import JOB_WORKER_LOST_ERROR_CODE
from src.modules.jobs.registry import (
    COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobCrossFieldValidator,
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

SKILL_GITHUB_IMPORT_JOB_TYPE: Final = "skill.github.import"
SKILL_GITHUB_REFRESH_JOB_TYPE: Final = "skill.github.refresh"
SKILL_GITHUB_JOB_TYPE_VERSION: Final = 2
SKILL_GITHUB_IMPORT_TASK_NAME: Final = "jobs:connector:skill-github-import:v2"
SKILL_GITHUB_REFRESH_TASK_NAME: Final = "jobs:connector:skill-github-refresh:v2"

SKILL_GITHUB_CONFIGURATION_INVALID: Final = "SKILL_GITHUB_CONFIGURATION_INVALID"
SKILL_GITHUB_DEFAULT_BRANCH_UNAVAILABLE: Final = "SKILL_GITHUB_DEFAULT_BRANCH_UNAVAILABLE"
SKILL_GITHUB_LIMIT_EXCEEDED: Final = "SKILL_GITHUB_LIMIT_EXCEEDED"
SKILL_GITHUB_METADATA_INVALID: Final = "SKILL_GITHUB_METADATA_INVALID"
SKILL_GITHUB_RESPONSE_INVALID: Final = "SKILL_GITHUB_RESPONSE_INVALID"
SKILL_GITHUB_SLUG_CONFLICT: Final = "SKILL_GITHUB_SLUG_CONFLICT"
SKILL_GITHUB_SOURCE_CONFLICT: Final = "SKILL_GITHUB_SOURCE_CONFLICT"
SKILL_GITHUB_SOURCE_INVALID: Final = "SKILL_GITHUB_SOURCE_INVALID"
SKILL_GITHUB_SKILL_ROOT_AMBIGUOUS: Final = "SKILL_GITHUB_SKILL_ROOT_AMBIGUOUS"
SKILL_GITHUB_SKILL_ROOT_NOT_FOUND: Final = "SKILL_GITHUB_SKILL_ROOT_NOT_FOUND"
SKILL_GITHUB_TARGET_NOT_FOUND: Final = "SKILL_GITHUB_TARGET_NOT_FOUND"
SKILL_GITHUB_TEMPORARILY_UNAVAILABLE: Final = "SKILL_GITHUB_TEMPORARILY_UNAVAILABLE"

SKILL_GITHUB_RETRYABLE_CODES: Final = frozenset({
    "BACKGROUND_JOB_TENANT_NOT_READY",
    JOB_WORKER_LOST_ERROR_CODE,
    SKILL_GITHUB_TEMPORARILY_UNAVAILABLE,
})

SKILL_GITHUB_TERMINAL_ERROR_CONTRACTS: Final = tuple(
    sorted(
        (
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            *WORKSPACE_JOB_TARGET_TERMINAL_ERROR_CONTRACTS,
            *ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS,
            *(
                JobTerminalErrorContract(code=code, metadata_schema=None)
                for code in (
                    SKILL_GITHUB_CONFIGURATION_INVALID,
                    SKILL_GITHUB_DEFAULT_BRANCH_UNAVAILABLE,
                    SKILL_GITHUB_LIMIT_EXCEEDED,
                    SKILL_GITHUB_METADATA_INVALID,
                    SKILL_GITHUB_RESPONSE_INVALID,
                    SKILL_GITHUB_SLUG_CONFLICT,
                    SKILL_GITHUB_SOURCE_CONFLICT,
                    SKILL_GITHUB_SOURCE_INVALID,
                    SKILL_GITHUB_SKILL_ROOT_AMBIGUOUS,
                    SKILL_GITHUB_SKILL_ROOT_NOT_FOUND,
                    SKILL_GITHUB_TARGET_NOT_FOUND,
                    SKILL_GITHUB_TEMPORARILY_UNAVAILABLE,
                )
            ),
        ),
        key=lambda contract: contract.code,
    )
)


class SkillGitHubImportJobTarget(BaseSchema):
    """Reference-only tenant target for one GitHub import operation."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    import_id: PublicUUID
    package_id: PublicUUID | None = None
    entity_type: Literal["skill_github_import"] = "skill_github_import"
    entity_id: PublicUUID


class SkillGitHubImportJobInput(BaseSchema):
    """Immutable public source locator; repository bytes never enter the Job payload."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    operation: Literal["initial", "refresh"]
    repository_url: str = Field(min_length=1, max_length=2048)
    request_revision: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class SkillGitHubImportJobResult(BaseSchema):
    """Reference to the exact immutable tenant Skill version produced by the Job."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["skill_github_import"] = "skill_github_import"
    import_id: PublicUUID
    package_id: PublicUUID
    version_id: PublicUUID
    resolved_commit: str = Field(pattern=r"^[0-9a-f]{40}$")
    resolved_tree: str = Field(pattern=r"^[0-9a-f]{40}$")
    package_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    status: Literal["candidate"] = "candidate"
    outcome_job_id: PublicUUID


def validate_skill_github_initial_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    _validate_target_input(target=target, input_reference=input_reference, operation="initial")


def validate_skill_github_refresh_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    _validate_target_input(target=target, input_reference=input_reference, operation="refresh")


def validate_skill_github_result(context: JobResultSemanticContext) -> None:
    target = cast(SkillGitHubImportJobTarget, context.target)
    input_reference = cast(SkillGitHubImportJobInput, context.input_reference)
    result = cast(SkillGitHubImportJobResult, context.result_reference)
    if result.import_id != target.import_id or result.outcome_job_id != context.job_id:
        raise ValueError("GitHub Skill result does not belong to its import Job")
    if target.package_id is not None and result.package_id != target.package_id:
        raise ValueError("GitHub Skill refresh result changed package authority")
    if context.source_revision != input_reference.request_revision:
        raise ValueError("GitHub Skill Job source revision differs from its input reference")


def build_skill_github_import_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    return _build_definition(
        job_type=SKILL_GITHUB_IMPORT_JOB_TYPE,
        task_name=SKILL_GITHUB_IMPORT_TASK_NAME,
        execution_policy=execution_policy,
        cross_field_validator=validate_skill_github_initial_target_input,
    )


def build_skill_github_refresh_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    return _build_definition(
        job_type=SKILL_GITHUB_REFRESH_JOB_TYPE,
        task_name=SKILL_GITHUB_REFRESH_TASK_NAME,
        execution_policy=execution_policy,
        cross_field_validator=validate_skill_github_refresh_target_input,
    )


def _validate_target_input(
    *,
    target: BaseSchema,
    input_reference: BaseSchema,
    operation: Literal["initial", "refresh"],
) -> None:
    if not isinstance(target, SkillGitHubImportJobTarget) or not isinstance(input_reference, SkillGitHubImportJobInput):
        raise TypeError("GitHub Skill cross-field validation requires its bound schemas")
    if target.entity_id != target.import_id or input_reference.operation != operation:
        raise ValueError("GitHub Skill Job target does not match its operation")
    if (operation == "initial") != (target.package_id is None):
        raise ValueError("Only a GitHub Skill refresh may bind an existing package")


def _build_definition(
    *,
    job_type: str,
    task_name: str,
    execution_policy: BackgroundJobExecutionSettings,
    cross_field_validator: JobCrossFieldValidator,
) -> JobTypeDefinition:
    manage = JobPermissionRequirement(
        scope=JobPermissionScope.WORKSPACE,
        action="system:settings:manage",
    )
    return JobTypeDefinition(
        job_type=job_type,
        job_type_version=SKILL_GITHUB_JOB_TYPE_VERSION,
        task_name=task_name,
        workload_class=JobWorkloadClass.CONNECTOR,
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.WORKSPACE,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=manage,
        commercial_effects=frozenset({RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT}),
        manage_permission=manage,
        initial_phase="queued",
        initial_status_key="WORKSPACE_SKILLS_GITHUB_STATUS_QUEUED",
        phases=frozenset({"queued", "resolving", "fetching", "verifying", "persisting"}),
        cancellable_phases=frozenset({"queued", "resolving", "fetching", "verifying"}),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=execution_policy.max_attempts,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
            retryable_codes=SKILL_GITHUB_RETRYABLE_CODES,
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace=job_type.replace(".", "-"),
        target_schema=SkillGitHubImportJobTarget,
        input_reference_schema=SkillGitHubImportJobInput,
        result_reference_schema=SkillGitHubImportJobResult,
        cross_field_validator=cross_field_validator,
        result_semantic_validator=validate_skill_github_result,
        terminal_error_contracts=SKILL_GITHUB_TERMINAL_ERROR_CONTRACTS,
    )
