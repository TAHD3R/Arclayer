from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from src.common.utils.ids import uuid7
from src.config import Settings
from src.models.jobs.background_job import JobAuthorityMode
from src.models.system.notification_campaign import NotificationCampaignRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.jobs.schema import BackgroundJobCreate
from src.modules.system.admin.notifications.campaign_job_contract import (
    NotificationCampaignJobInput,
    NotificationCampaignJobTarget,
    build_campaign_source_revision,
    build_notification_campaign_job_definition,
)


def build_campaign_job_command(
    *,
    settings: Settings,
    campaign: NotificationCampaignRecord,
    scheduled_at: datetime,
    retry_failed_only: bool,
    actor_user_id: UUID,
    idempotency_suffix: str | None = None,
) -> BackgroundJobCreate:
    definition = build_notification_campaign_job_definition(
        execution_policy=settings.background_jobs.notification_campaign,
    )
    input_reference = NotificationCampaignJobInput(
        campaign_id=campaign.id,
        campaign_revision=campaign.revision,
        retry_failed_only=retry_failed_only,
    )
    target = NotificationCampaignJobTarget(campaign_id=campaign.id)
    operation = "retry" if retry_failed_only else "publish"
    suffix = f":{idempotency_suffix}" if idempotency_suffix else ""
    return BackgroundJobCreate(
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        actor_user_id=actor_user_id,
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        idempotency_key=f"campaign:{campaign.id}:v{campaign.revision}:{operation}{suffix}",
        source_revision=build_campaign_source_revision(input_reference),
        correlation_id=f"notification-campaign:{uuid7()}",
        retry_class=definition.retry_class,
        max_attempts=definition.max_attempts,
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
        retry_of_job_id=campaign.operation_job_id if retry_failed_only else None,
        status_key=definition.initial_status_key,
        dispatch_after=scheduled_at,
    )


async def write_campaign_activity_event(
    *,
    settings: Settings,
    event_name: str,
    campaign: NotificationCampaignRecord,
    actor_user_id: UUID,
    properties: dict[str, Any],
    conn: Any,
) -> None:
    await write_required_activity_event(
        settings=settings,
        payload=ActivityAuditPayload(
            event_name=event_name,
            actor_user_id=actor_user_id,
            entity_type="notification_campaign",
            entity_id=UUID(str(campaign.id)),
            source="api",
            properties={"campaign_name": str(campaign.name), **properties},
        ),
        conn=conn,
    )
