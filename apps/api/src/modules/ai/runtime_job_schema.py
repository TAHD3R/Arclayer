from __future__ import annotations

from typing import Final, Literal, cast

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import (
    JobAuthorityMode,
    JobRetryClass,
    JobWorkloadClass,
)
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

AGENT_RUN_JOB_TYPE: Final = "agent.run.execute"
AGENT_RUN_JOB_TYPE_VERSION: Final = 1
AGENT_RUN_JOB_TASK_NAME: Final = "jobs:agent-io:agent-run-execute:v1"
AGENT_RUN_JOB_FAILURE_CODE: Final = "AGENT_RUN_EXECUTION_FAILED"
AGENT_RUN_SETTLEMENT_PENDING_CODE: Final = "AGENT_RUN_SETTLEMENT_PENDING"


class AgentRunJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID


class AgentRunJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    run_id: PublicUUID
    thread_id: PublicUUID
    project_id: PublicUUID | None = None
    request_hash: str = Field(min_length=64, max_length=64)


class AgentRunJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    run_id: PublicUUID
    thread_id: PublicUUID
    status: Literal["completed"]
    last_sequence: int
    last_cursor: str


class AgentRunJobFailureMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    public_error_code: str


AGENT_RUN_JOB_TERMINAL_ERROR_CONTRACTS: Final = tuple(
    sorted(
        (
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            *WORKSPACE_JOB_TARGET_TERMINAL_ERROR_CONTRACTS,
            *ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS,
            JobTerminalErrorContract(
                code=AGENT_RUN_JOB_FAILURE_CODE,
                metadata_schema=AgentRunJobFailureMetadata,
            ),
            JobTerminalErrorContract(
                code=AGENT_RUN_SETTLEMENT_PENDING_CODE,
                metadata_schema=None,
            ),
        ),
        key=lambda contract: contract.code,
    )
)


def build_agent_run_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    retryable_codes = frozenset({
        JOB_WORKER_LOST_ERROR_CODE,
        AGENT_RUN_SETTLEMENT_PENDING_CODE,
    })
    content_manage = JobPermissionRequirement(
        scope=JobPermissionScope.WORKSPACE,
        action="system:content:manage",
    )
    return JobTypeDefinition(
        job_type=AGENT_RUN_JOB_TYPE,
        job_type_version=AGENT_RUN_JOB_TYPE_VERSION,
        task_name=AGENT_RUN_JOB_TASK_NAME,
        workload_class=JobWorkloadClass.AGENT_IO,
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.OWNER_ONLY,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=content_manage,
        manage_permission=content_manage,
        initial_phase="queued",
        initial_status_key="AI_AGENT_RUN_STATUS_QUEUED",
        phases=frozenset({"queued", "executing", "settling"}),
        cancellable_phases=frozenset({"queued", "executing", "settling"}),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=execution_policy.max_attempts,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
            retryable_codes=retryable_codes,
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="agent-run",
        target_schema=AgentRunJobTarget,
        input_reference_schema=AgentRunJobInput,
        result_reference_schema=AgentRunJobResult,
        result_semantic_validator=_validate_result_binding,
        terminal_error_contracts=AGENT_RUN_JOB_TERMINAL_ERROR_CONTRACTS,
    )


def _validate_result_binding(context: JobResultSemanticContext) -> None:
    input_reference = cast(AgentRunJobInput, context.input_reference)
    result = cast(AgentRunJobResult, context.result_reference)
    if result.run_id != input_reference.run_id or result.thread_id != input_reference.thread_id:
        raise ValueError("Agent Run Job result does not belong to its input reference")
