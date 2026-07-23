from __future__ import annotations

from uuid import uuid4

import pytest

from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.jobs.execution_errors import JOB_WORKER_LOST_ERROR_CODE
from src.modules.jobs.registry import JobResultSemanticContext, JobTargetScope, JobVisibility
from src.modules.system.admin.notifications.campaign_job_contract import (
    CAMPAIGN_PROVIDER_UNAVAILABLE_CODE,
    NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE,
    NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE_VERSION,
    NotificationCampaignJobInput,
    NotificationCampaignJobResult,
    NotificationCampaignJobTarget,
    build_campaign_source_revision,
    build_notification_campaign_job_definition,
    validate_campaign_result,
    validate_campaign_target_input,
)
from src.settings.env_models import BackgroundJobExecutionSettings

pytestmark = pytest.mark.unit


def test_campaign_job_definition_binds_strict_system_maintenance_policy() -> None:
    policy = BackgroundJobExecutionSettings(
        max_attempts=5,
        initial_delay_seconds=7,
        multiplier=2,
        maximum_delay_seconds=120,
        timeout_seconds=900,
        lease_seconds=120,
        heartbeat_seconds=40,
    )

    definition = build_notification_campaign_job_definition(execution_policy=policy)

    assert definition.job_type == NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE
    assert definition.job_type_version == NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE_VERSION
    assert definition.workload_class == JobWorkloadClass.MAINTENANCE
    assert definition.target_scope == JobTargetScope.SYSTEM
    assert definition.visibility == JobVisibility.SYSTEM
    assert definition.authority_mode == JobAuthorityMode.SYSTEM_SERVICE
    assert definition.required_permission is None
    assert definition.manage_permission is None
    assert definition.retry_class == JobRetryClass.TRANSIENT
    assert definition.retry_policy.max_attempts == 5
    assert definition.retry_policy.retryable_codes == frozenset({
        CAMPAIGN_PROVIDER_UNAVAILABLE_CODE,
        JOB_WORKER_LOST_ERROR_CODE,
    })
    assert definition.target_schema is NotificationCampaignJobTarget
    assert definition.input_reference_schema is NotificationCampaignJobInput
    assert definition.result_reference_schema is NotificationCampaignJobResult
    assert definition.cross_field_validator is validate_campaign_target_input
    assert definition.result_semantic_validator is validate_campaign_result


def test_campaign_job_contract_rejects_different_target_and_input_campaigns() -> None:
    with pytest.raises(ValueError, match="same campaign"):
        validate_campaign_target_input(
            NotificationCampaignJobTarget(campaign_id=uuid4()),
            NotificationCampaignJobInput(campaign_id=uuid4(), campaign_revision=2),
        )


@pytest.mark.parametrize(
    ("result_update", "source_revision", "message"),
    [
        ({"campaign_id": uuid4()}, None, "reference the Job campaign"),
        ({"campaign_revision": 4}, None, "reference the Job revision"),
        ({"sent_count": 1, "delivered_count": 2}, None, "cannot exceed"),
        ({}, "notification-campaign:stale:v1:publish", "source revision differs"),
    ],
)
def test_campaign_result_semantics_reject_drift(
    result_update: dict[str, object],
    source_revision: str | None,
    message: str,
) -> None:
    campaign_id = uuid4()
    input_reference = NotificationCampaignJobInput(
        campaign_id=campaign_id,
        campaign_revision=3,
    )
    result_values: dict[str, object] = {
        "campaign_id": campaign_id,
        "campaign_revision": 3,
        "recipient_count": 2,
        "sent_count": 2,
        "delivered_count": 1,
        "failed_count": 0,
    }
    result_values.update(result_update)
    context = JobResultSemanticContext(
        job_id=uuid4(),
        source_revision=source_revision or build_campaign_source_revision(input_reference),
        target=NotificationCampaignJobTarget(campaign_id=campaign_id),
        input_reference=input_reference,
        result_reference=NotificationCampaignJobResult.model_validate(result_values),
    )

    with pytest.raises(ValueError, match=message):
        validate_campaign_result(context)


def test_campaign_result_semantics_accept_retry_revision_identity() -> None:
    campaign_id = uuid4()
    input_reference = NotificationCampaignJobInput(
        campaign_id=campaign_id,
        campaign_revision=7,
        retry_failed_only=True,
    )
    context = JobResultSemanticContext(
        job_id=uuid4(),
        source_revision=build_campaign_source_revision(input_reference),
        target=NotificationCampaignJobTarget(campaign_id=campaign_id),
        input_reference=input_reference,
        result_reference=NotificationCampaignJobResult(
            campaign_id=campaign_id,
            campaign_revision=7,
            recipient_count=10,
            sent_count=8,
            delivered_count=6,
            failed_count=2,
        ),
    )

    validate_campaign_result(context)
    assert context.source_revision == build_campaign_source_revision(input_reference)
