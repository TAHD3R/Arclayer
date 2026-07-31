from __future__ import annotations

from hashlib import sha256
from typing import Final, Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.models.commerce.access_facts import CommercialAccessFactKind
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
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

COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE: Final = "commerce.access-fact.consume"
COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE_VERSION: Final = 1
COMMERCE_ACCESS_FACT_CONSUME_TASK_NAME: Final = "jobs:maintenance:commerce-access-fact-consume:v1"

COMMERCE_ACCESS_FACT_INVALID_CODE: Final = "COMMERCE_ACCESS_FACT_INVALID"
COMMERCE_ACCESS_FACT_CONSUMER_UNAVAILABLE_CODE: Final = "COMMERCE_ACCESS_FACT_CONSUMER_UNAVAILABLE"

COMMERCE_ACCESS_FACT_RETRYABLE_CODES: Final = frozenset({
    COMMERCE_ACCESS_FACT_CONSUMER_UNAVAILABLE_CODE,
    JOB_WORKER_LOST_ERROR_CODE,
})
COMMERCE_ACCESS_FACT_TERMINAL_ERROR_CONTRACTS: Final = (
    *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobTerminalErrorContract(code=COMMERCE_ACCESS_FACT_INVALID_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=COMMERCE_ACCESS_FACT_CONSUMER_UNAVAILABLE_CODE, metadata_schema=None),
)


class CommercialAccessFactJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: CommercialAccessFactKind
    source_identity: str = Field(min_length=1, max_length=255)


class CommercialAccessFactJobInput(CommercialAccessFactJobTarget):
    pass


class CommercialAccessFactJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["commerce_access_fact"] = "commerce_access_fact"
    fact_kind: CommercialAccessFactKind
    source_identity: str = Field(min_length=1, max_length=255)


def validate_commercial_access_fact_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    parsed_target = CommercialAccessFactJobTarget.model_validate(target)
    parsed_input = CommercialAccessFactJobInput.model_validate(input_reference)
    if parsed_target.kind != parsed_input.kind or parsed_target.source_identity != parsed_input.source_identity:
        raise ValueError("Commerce access fact Job target and input must match")


def validate_commercial_access_fact_result(context: JobResultSemanticContext) -> None:
    target = CommercialAccessFactJobTarget.model_validate(context.target)
    result = CommercialAccessFactJobResult.model_validate(context.result_reference)
    if result.fact_kind != target.kind or result.source_identity != target.source_identity:
        raise ValueError("Commerce access fact result must reference the exact consumed fact")
    if context.source_revision != commercial_access_fact_source_revision(target):
        raise ValueError("Commerce access fact source revision differs from its immutable target")


def commercial_access_fact_source_revision(target: CommercialAccessFactJobTarget) -> str:
    identity = f"{target.kind}:{target.source_identity}"
    return f"commerce-access-fact:{sha256(identity.encode()).hexdigest()}"


def build_commercial_access_fact_job_definition(
    *, execution_policy: BackgroundJobExecutionSettings
) -> JobTypeDefinition:
    return JobTypeDefinition(
        job_type=COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE,
        job_type_version=COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE_VERSION,
        task_name=COMMERCE_ACCESS_FACT_CONSUME_TASK_NAME,
        workload_class=JobWorkloadClass.MAINTENANCE,
        target_scope=JobTargetScope.SYSTEM,
        visibility=JobVisibility.SYSTEM,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        initial_phase="queued",
        initial_status_key="COMMERCE_ACCESS_FACT_STATUS_QUEUED",
        phases=frozenset({"queued", "consuming", "settling"}),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=execution_policy.max_attempts,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
            retryable_codes=COMMERCE_ACCESS_FACT_RETRYABLE_CODES,
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="commerce-access-fact-consume",
        target_schema=CommercialAccessFactJobTarget,
        input_reference_schema=CommercialAccessFactJobInput,
        result_reference_schema=CommercialAccessFactJobResult,
        cross_field_validator=validate_commercial_access_fact_target_input,
        result_semantic_validator=validate_commercial_access_fact_result,
        terminal_error_contracts=COMMERCE_ACCESS_FACT_TERMINAL_ERROR_CONTRACTS,
    )
