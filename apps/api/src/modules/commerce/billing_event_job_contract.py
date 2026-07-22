from __future__ import annotations

from typing import Final, Literal

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
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

BILLING_CONNECTOR_EVENT_JOB_TYPE: Final = "billing.connector-event.process"
BILLING_CONNECTOR_EVENT_JOB_TYPE_VERSION: Final = 1
BILLING_CONNECTOR_EVENT_TASK_NAME: Final = "jobs:connector:billing-event-process:v1"

BILLING_CONNECTOR_EVENT_NOT_FOUND_CODE: Final = "BILLING_CONNECTOR_EVENT_NOT_FOUND"
BILLING_CONNECTOR_VERSION_UNAVAILABLE_CODE: Final = "BILLING_CONNECTOR_VERSION_UNAVAILABLE"
BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE: Final = "BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID"
BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE_CODE: Final = "BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE"
BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE: Final = "BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED"

BILLING_CONNECTOR_EVENT_RETRYABLE_CODES: Final = frozenset({
    BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE_CODE,
    JOB_WORKER_LOST_ERROR_CODE,
})
BILLING_CONNECTOR_EVENT_TERMINAL_ERROR_CONTRACTS: Final = (
    *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobTerminalErrorContract(code=BILLING_CONNECTOR_EVENT_NOT_FOUND_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=BILLING_CONNECTOR_VERSION_UNAVAILABLE_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE, metadata_schema=None),
)


class BillingConnectorEventJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    inbox_id: PublicUUID


class BillingConnectorEventJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    inbox_id: PublicUUID
    connector_key: str = Field(..., min_length=3, max_length=128)
    connector_version: str = Field(..., min_length=1, max_length=64)
    payload_sha256: str = Field(..., pattern=r"^[a-f0-9]{64}$")


class BillingConnectorEventJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["billing_connector_event"] = "billing_connector_event"
    inbox_id: PublicUUID
    provider_event_id: str = Field(..., min_length=1, max_length=255)
    applied: bool
    workspace_id: PublicUUID | None = None

    @model_validator(mode="after")
    def validate_applied_workspace(self) -> BillingConnectorEventJobResult:
        if self.applied != (self.workspace_id is not None):
            raise ValueError("applied billing event results require exactly one workspace reference")
        return self


def validate_billing_connector_event_target_input(
    target: BaseSchema,
    input_reference: BaseSchema,
) -> None:
    parsed_target = BillingConnectorEventJobTarget.model_validate(target)
    parsed_input = BillingConnectorEventJobInput.model_validate(input_reference)
    if parsed_target.inbox_id != parsed_input.inbox_id:
        raise ValueError("billing event target and input must reference the same inbox")


def validate_billing_connector_event_result(context: JobResultSemanticContext) -> None:
    target = BillingConnectorEventJobTarget.model_validate(context.target)
    input_reference = BillingConnectorEventJobInput.model_validate(context.input_reference)
    result = BillingConnectorEventJobResult.model_validate(context.result_reference)
    if result.inbox_id != target.inbox_id or result.inbox_id != input_reference.inbox_id:
        raise ValueError("billing event result must reference the Job inbox")


def build_billing_connector_event_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    return JobTypeDefinition(
        job_type=BILLING_CONNECTOR_EVENT_JOB_TYPE,
        job_type_version=BILLING_CONNECTOR_EVENT_JOB_TYPE_VERSION,
        task_name=BILLING_CONNECTOR_EVENT_TASK_NAME,
        workload_class=JobWorkloadClass.CONNECTOR,
        target_scope=JobTargetScope.SYSTEM,
        visibility=JobVisibility.SYSTEM,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        initial_phase="queued",
        initial_status_key="BILLING_CONNECTOR_EVENT_STATUS_QUEUED",
        phases=frozenset({"queued", "loading", "normalizing", "applying"}),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=execution_policy.max_attempts,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
            retryable_codes=BILLING_CONNECTOR_EVENT_RETRYABLE_CODES,
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="billing-connector-event",
        target_schema=BillingConnectorEventJobTarget,
        input_reference_schema=BillingConnectorEventJobInput,
        result_reference_schema=BillingConnectorEventJobResult,
        cross_field_validator=validate_billing_connector_event_target_input,
        result_semantic_validator=validate_billing_connector_event_result,
        terminal_error_contracts=BILLING_CONNECTOR_EVENT_TERMINAL_ERROR_CONTRACTS,
    )
