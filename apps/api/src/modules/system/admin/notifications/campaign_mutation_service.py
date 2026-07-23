from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.services import BaseService
from src.models.system.notification_campaign import NotificationCampaignRecord, NotificationCampaignState
from src.modules.jobs.service import BackgroundJobService
from src.modules.system.admin.notifications.campaign_assets import CampaignAssetReader
from src.modules.system.admin.notifications.campaign_commands import (
    build_campaign_job_command,
    write_campaign_activity_event,
)
from src.modules.system.admin.notifications.campaign_contracts import (
    NotificationAudienceRule,
    NotificationCampaignCreateRequest,
    NotificationCampaignPatchRequest,
    NotificationCampaignPublishRequest,
)
from src.modules.system.admin.notifications.campaign_editing import (
    campaign_record_data,
    campaign_update_data,
    changed_campaign_fields,
    editable_campaign_from_record,
    merge_campaign_patch,
    require_campaign_revision,
    require_draft_campaign,
    variant_record_data,
)
from src.modules.system.admin.notifications.campaign_query_service import NotificationCampaignQueryService
from src.modules.system.admin.notifications.campaign_repository import NotificationCampaignRepository
from src.modules.system.admin.notifications.campaign_schema import (
    NotificationCampaignCancellationOut,
    NotificationCampaignDetailOut,
    NotificationCampaignPublishOut,
    NotificationCampaignRetryOut,
    NotificationCampaignSummaryOut,
)
from src.modules.system.admin.notifications.campaign_validation import (
    CampaignEmailTemplateReader,
    validate_campaign_for_publish,
)


class NotificationCampaignMutationService(BaseService):
    def __init__(
        self,
        repository: NotificationCampaignRepository,
        *,
        query: NotificationCampaignQueryService,
        jobs: BackgroundJobService,
        assets: CampaignAssetReader,
        templates: CampaignEmailTemplateReader,
        settings: Settings | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository
        self.query = query
        self.jobs = jobs
        self.assets = assets
        self.templates = templates

    async def create_campaign(
        self,
        *,
        payload: NotificationCampaignCreateRequest,
        actor_user_id: UUID,
    ) -> NotificationCampaignDetailOut:
        async with self.tx() as conn:
            campaign = await self.repository.create_campaign(
                data=campaign_record_data(payload, actor_user_id=actor_user_id),
                conn=conn,
            )
            await self.repository.replace_variants(
                campaign_id=campaign.id,
                variants=variant_record_data(payload.variants, fallback_locale=payload.fallback_locale, revision=1),
                conn=conn,
            )
            await write_campaign_activity_event(
                settings=self.settings,
                event_name="system.notification.campaign.created",
                campaign=campaign,
                actor_user_id=actor_user_id,
                properties={"revision": 1},
                conn=conn,
            )
        return await self.query.detail_from_record(campaign)

    async def update_campaign(
        self,
        *,
        campaign_id: UUID,
        payload: NotificationCampaignPatchRequest,
        actor_user_id: UUID,
    ) -> NotificationCampaignDetailOut:
        async with self.tx() as conn:
            campaign = await self._require_locked(campaign_id, conn=conn)
            require_campaign_revision(campaign, payload.expected_revision)
            require_draft_campaign(campaign)
            variants = await self.repository.list_variants(campaign_id, conn=conn)
            current = editable_campaign_from_record(campaign, variants=variants)
            merged = merge_campaign_patch(current, payload)
            changed_fields = changed_campaign_fields(current, merged)
            if changed_fields:
                next_revision = int(campaign.revision) + 1
                await self.repository.save_campaign(
                    campaign,
                    fields={**campaign_update_data(merged), "revision": next_revision},
                    conn=conn,
                )
                if "variants" in changed_fields or "fallback_locale" in changed_fields:
                    await self.repository.replace_variants(
                        campaign_id=campaign.id,
                        variants=variant_record_data(
                            merged.variants,
                            fallback_locale=merged.fallback_locale,
                            revision=next_revision,
                        ),
                        conn=conn,
                    )
                await write_campaign_activity_event(
                    settings=self.settings,
                    event_name="system.notification.campaign.updated",
                    campaign=campaign,
                    actor_user_id=actor_user_id,
                    properties={"revision": next_revision, "changed_fields": changed_fields},
                    conn=conn,
                )
        return await self.query.get_campaign(campaign_id)

    async def publish_campaign(
        self,
        *,
        campaign_id: UUID,
        payload: NotificationCampaignPublishRequest,
        actor_user_id: UUID,
    ) -> NotificationCampaignPublishOut:
        candidate = await self.query.require_campaign(campaign_id)
        require_campaign_revision(candidate, payload.expected_revision)
        require_draft_campaign(candidate)
        variants = await self.repository.list_variants(campaign_id)
        await validate_campaign_for_publish(
            campaign=candidate,
            variants=variants,
            settings=self.settings,
            assets=self.assets,
            templates=self.templates,
        )
        audience = NotificationAudienceRule.model_validate(candidate.audience)
        audience_count, _ = await self.repository.estimate_audience(audience)
        if audience_count == 0:
            raise BadRequest(error="NOTIFICATION_CAMPAIGN_AUDIENCE_EMPTY")
        scheduled_at = payload.schedule_at or datetime.now(UTC)
        if scheduled_at.tzinfo is None:
            raise BadRequest(error="NOTIFICATION_CAMPAIGN_SCHEDULE_TIMEZONE_REQUIRED")
        if payload.schedule_at and scheduled_at <= datetime.now(UTC):
            raise BadRequest(error="NOTIFICATION_CAMPAIGN_SCHEDULE_IN_PAST")

        async with self.tx() as conn:
            campaign = await self._require_locked(campaign_id, conn=conn)
            require_campaign_revision(campaign, payload.expected_revision)
            require_draft_campaign(campaign)
            job_result = await self.jobs.create_job_in_transaction(
                command=build_campaign_job_command(
                    settings=self.settings,
                    campaign=campaign,
                    scheduled_at=scheduled_at,
                    retry_failed_only=False,
                    actor_user_id=actor_user_id,
                ),
                conn=conn,
            )
            await self.repository.save_campaign(
                campaign,
                fields={
                    "state": NotificationCampaignState.SCHEDULED,
                    "schedule_at": scheduled_at,
                    "audience_estimate": audience_count,
                    "audience_snapshot_at": datetime.now(UTC),
                    "operation_job_id": job_result.job.id,
                    "published_at": datetime.now(UTC),
                },
                conn=conn,
            )
            await write_campaign_activity_event(
                settings=self.settings,
                event_name="system.notification.campaign.published",
                campaign=campaign,
                actor_user_id=actor_user_id,
                properties={
                    "revision": campaign.revision,
                    "audience_estimate": audience_count,
                    "job_id": str(job_result.job.id),
                    "scheduled_at": scheduled_at.isoformat(),
                    "audience_resolution": "dispatch_time",
                },
                conn=conn,
            )
        await self.jobs.publish_created_after_commit(job_result)
        return NotificationCampaignPublishOut(
            campaign=await self.query.summary_from_record(campaign),
            job_id=job_result.job.id,
            scheduled_at=scheduled_at,
        )

    async def cancel_campaign(
        self,
        *,
        campaign_id: UUID,
        expected_revision: int,
        actor_user_id: UUID,
    ) -> NotificationCampaignCancellationOut:
        now = datetime.now(UTC)
        async with self.tx() as conn:
            campaign = await self._require_locked(campaign_id, conn=conn)
            require_campaign_revision(campaign, expected_revision)
            if campaign.state not in {NotificationCampaignState.SCHEDULED, NotificationCampaignState.DISPATCHING}:
                raise Conflict(error="NOTIFICATION_CAMPAIGN_CANNOT_CANCEL")
            if campaign.operation_job_id is None:
                raise RuntimeError(f"Notification campaign {campaign.id} has no durable operation Job")
            job, requested = await self.jobs.request_cancellation_in_transaction(
                job_id=campaign.operation_job_id,
                requested_by_user_id=actor_user_id,
                reason="notification campaign cancelled",
                requested_at=now,
                conn=conn,
            )
            cancelled = await self.repository.cancel_pending_deliveries(
                campaign_id=campaign_id,
                cancelled_at=now,
                conn=conn,
            )
            await self.repository.save_campaign(
                campaign,
                fields={"state": NotificationCampaignState.CANCELLED, "cancelled_at": now},
                conn=conn,
            )
            await write_campaign_activity_event(
                settings=self.settings,
                event_name="system.notification.campaign.cancelled",
                campaign=campaign,
                actor_user_id=actor_user_id,
                properties={"cancelled_deliveries": cancelled},
                conn=conn,
            )
        await self.jobs.publish_cancellation_requested_after_commit(job=job, requested=requested)
        return NotificationCampaignCancellationOut(
            campaign=await self.query.summary_from_record(campaign),
            cancelled_deliveries=cancelled,
            non_recallable_deliveries=int(campaign.sent_count) + int(campaign.delivered_count),
        )

    async def archive_campaign(
        self,
        *,
        campaign_id: UUID,
        expected_revision: int,
        actor_user_id: UUID,
    ) -> NotificationCampaignSummaryOut:
        async with self.tx() as conn:
            campaign = await self._require_locked(campaign_id, conn=conn)
            require_campaign_revision(campaign, expected_revision)
            if campaign.state not in {
                NotificationCampaignState.COMPLETED,
                NotificationCampaignState.PARTIALLY_FAILED,
                NotificationCampaignState.CANCELLED,
            }:
                raise Conflict(error="NOTIFICATION_CAMPAIGN_CANNOT_ARCHIVE")
            now = datetime.now(UTC)
            await self.repository.save_campaign(
                campaign,
                fields={"state": NotificationCampaignState.ARCHIVED, "archived_at": now},
                conn=conn,
            )
            await write_campaign_activity_event(
                settings=self.settings,
                event_name="system.notification.campaign.archived",
                campaign=campaign,
                actor_user_id=actor_user_id,
                properties={},
                conn=conn,
            )
        return await self.query.summary_from_record(campaign)

    async def retry_failures(
        self,
        *,
        campaign_id: UUID,
        idempotency_key: str,
        actor_user_id: UUID,
    ) -> NotificationCampaignRetryOut:
        retryable = await self.repository.count_retryable_deliveries(campaign_id)
        if retryable == 0:
            raise Conflict(error="NOTIFICATION_CAMPAIGN_NO_RETRYABLE_FAILURES")
        async with self.tx() as conn:
            campaign = await self._require_locked(campaign_id, conn=conn)
            if campaign.state != NotificationCampaignState.PARTIALLY_FAILED:
                raise Conflict(error="NOTIFICATION_CAMPAIGN_CANNOT_RETRY")
            now = datetime.now(UTC)
            job_result = await self.jobs.create_job_in_transaction(
                command=build_campaign_job_command(
                    settings=self.settings,
                    campaign=campaign,
                    scheduled_at=now,
                    retry_failed_only=True,
                    actor_user_id=actor_user_id,
                    idempotency_suffix=idempotency_key,
                ),
                conn=conn,
            )
            await self.repository.save_campaign(
                campaign,
                fields={"state": NotificationCampaignState.SCHEDULED, "operation_job_id": job_result.job.id},
                conn=conn,
            )
            await write_campaign_activity_event(
                settings=self.settings,
                event_name="system.notification.campaign.failures_retried",
                campaign=campaign,
                actor_user_id=actor_user_id,
                properties={"retryable_deliveries": retryable, "job_id": str(job_result.job.id)},
                conn=conn,
            )
        await self.jobs.publish_created_after_commit(job_result)
        return NotificationCampaignRetryOut(
            campaign_id=campaign.id,
            job_id=job_result.job.id,
            retryable_delivery_count=retryable,
        )

    async def _require_locked(self, campaign_id: UUID, *, conn: Any) -> NotificationCampaignRecord:
        campaign = await self.repository.get_campaign(campaign_id, conn=conn, for_update=True)
        if campaign is None:
            raise NotFound(error="NOTIFICATION_CAMPAIGN_NOT_FOUND")
        return campaign
