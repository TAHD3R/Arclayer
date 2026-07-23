from __future__ import annotations

from typing import Final, Literal

from pydantic import ConfigDict, Field

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

NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE: Final = "notification.campaign.dispatch"
NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE_VERSION: Final = 1
NOTIFICATION_CAMPAIGN_DISPATCH_TASK_NAME: Final = "jobs:maintenance:notification-campaign-dispatch:v1"

CAMPAIGN_NOT_FOUND_CODE: Final = "NOTIFICATION_CAMPAIGN_NOT_FOUND"
CAMPAIGN_REVISION_MISMATCH_CODE: Final = "NOTIFICATION_CAMPAIGN_REVISION_MISMATCH"
CAMPAIGN_STATE_INVALID_CODE: Final = "NOTIFICATION_CAMPAIGN_STATE_INVALID"
CAMPAIGN_CONTENT_INVALID_CODE: Final = "NOTIFICATION_CAMPAIGN_CONTENT_INVALID"
CAMPAIGN_PROVIDER_UNAVAILABLE_CODE: Final = "NOTIFICATION_CAMPAIGN_PROVIDER_UNAVAILABLE"

CAMPAIGN_RETRYABLE_CODES: Final = frozenset({
    CAMPAIGN_PROVIDER_UNAVAILABLE_CODE,
    JOB_WORKER_LOST_ERROR_CODE,
})
CAMPAIGN_TERMINAL_ERROR_CONTRACTS: Final = (
    *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobTerminalErrorContract(code=CAMPAIGN_NOT_FOUND_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=CAMPAIGN_REVISION_MISMATCH_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=CAMPAIGN_STATE_INVALID_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=CAMPAIGN_CONTENT_INVALID_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=CAMPAIGN_PROVIDER_UNAVAILABLE_CODE, metadata_schema=None),
)


class NotificationCampaignJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    campaign_id: PublicUUID


class NotificationCampaignJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    campaign_id: PublicUUID
    campaign_revision: int = Field(..., ge=1)
    retry_failed_only: bool = False


class NotificationCampaignJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["notification_campaign_dispatch"] = "notification_campaign_dispatch"
    campaign_id: PublicUUID
    campaign_revision: int = Field(..., ge=1)
    recipient_count: int = Field(..., ge=0)
    sent_count: int = Field(..., ge=0)
    delivered_count: int = Field(..., ge=0)
    failed_count: int = Field(..., ge=0)


def validate_campaign_target_input(target: BaseSchema, input_reference: BaseSchema) -> None:
    parsed_target = NotificationCampaignJobTarget.model_validate(target)
    parsed_input = NotificationCampaignJobInput.model_validate(input_reference)
    if parsed_target.campaign_id != parsed_input.campaign_id:
        raise ValueError("notification campaign Job target and input must reference the same campaign")


def validate_campaign_result(context: JobResultSemanticContext) -> None:
    target = NotificationCampaignJobTarget.model_validate(context.target)
    input_reference = NotificationCampaignJobInput.model_validate(context.input_reference)
    result = NotificationCampaignJobResult.model_validate(context.result_reference)
    if result.campaign_id != target.campaign_id or result.campaign_id != input_reference.campaign_id:
        raise ValueError("notification campaign result must reference the Job campaign")
    if result.campaign_revision != input_reference.campaign_revision:
        raise ValueError("notification campaign result must reference the Job revision")
    if result.delivered_count > result.sent_count:
        raise ValueError("notification campaign delivered count cannot exceed terminal delivery outcomes")
    if context.source_revision != build_campaign_source_revision(input_reference):
        raise ValueError("notification campaign source revision differs from its immutable Job input")


def build_campaign_source_revision(input_reference: NotificationCampaignJobInput) -> str:
    retry_kind = "retry" if input_reference.retry_failed_only else "publish"
    return f"notification-campaign:{input_reference.campaign_id}:v{input_reference.campaign_revision}:{retry_kind}"


def build_notification_campaign_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    return JobTypeDefinition(
        job_type=NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE,
        job_type_version=NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE_VERSION,
        task_name=NOTIFICATION_CAMPAIGN_DISPATCH_TASK_NAME,
        workload_class=JobWorkloadClass.MAINTENANCE,
        target_scope=JobTargetScope.SYSTEM,
        visibility=JobVisibility.SYSTEM,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        initial_phase="queued",
        initial_status_key="NOTIFICATION_CAMPAIGN_STATUS_QUEUED",
        phases=frozenset({"queued", "resolving_audience", "creating_deliveries", "delivering", "settling"}),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=execution_policy.max_attempts,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
            retryable_codes=CAMPAIGN_RETRYABLE_CODES,
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="notification-campaign-dispatch",
        target_schema=NotificationCampaignJobTarget,
        input_reference_schema=NotificationCampaignJobInput,
        result_reference_schema=NotificationCampaignJobResult,
        cross_field_validator=validate_campaign_target_input,
        result_semantic_validator=validate_campaign_result,
        terminal_error_contracts=CAMPAIGN_TERMINAL_ERROR_CONTRACTS,
    )
