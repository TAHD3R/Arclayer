from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol
from uuid import UUID

from src.common.email.provider import SendResult
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.system.notification import NotificationCategory
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignRecord,
    NotificationCampaignState,
    NotificationCampaignVariantRecord,
    NotificationDeliveryRecord,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandlerTerminalError
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.system.admin.notifications.campaign_contracts import (
    NotificationActionKind,
    NotificationAudienceRule,
    NotificationBannerPayload,
    NotificationEmailPayload,
    NotificationInboxPayload,
    NotificationModalPayload,
    NotificationToastPayload,
)
from src.modules.system.admin.notifications.campaign_delivery_repository import (
    NotificationCampaignDeliveryRepository,
    delivery_idempotency_key,
)
from src.modules.system.admin.notifications.campaign_job_contract import (
    CAMPAIGN_CONTENT_INVALID_CODE,
    CAMPAIGN_NOT_FOUND_CODE,
    CAMPAIGN_REVISION_MISMATCH_CODE,
    CAMPAIGN_STATE_INVALID_CODE,
    NotificationCampaignJobInput,
    NotificationCampaignJobResult,
    NotificationCampaignJobTarget,
)
from src.modules.system.admin.notifications.campaign_repository import NotificationCampaignRepository
from src.modules.system.admin.notifications.catalog import create_notification_record
from src.modules.system.admin.notifications.preferences import is_notification_channel_enabled_for_event

if TYPE_CHECKING:
    from src.models.organization.user import User

_GLOBAL_NOTIFICATION_WORKSPACE_ID = UUID(int=0)
_GLOBAL_NOTIFICATION_EVENT = "system.broadcast"
_AUDIENCE_BATCH_SIZE = 200
_DELIVERY_BATCH_SIZE = 100


class CampaignEmailSender(Protocol):
    async def send_template_version(
        self,
        *,
        recipient: str,
        template_key: str,
        template_version: int,
        locale: str,
        variables: JsonObject,
        idempotency_key: str,
    ) -> SendResult: ...


class NotificationCampaignJobHandler:
    """Materialize and deliver one immutable campaign revision from its durable Job."""

    def __init__(
        self,
        *,
        settings: Settings,
        email_sender: CampaignEmailSender,
        campaigns: NotificationCampaignRepository | None = None,
        deliveries: NotificationCampaignDeliveryRepository | None = None,
    ) -> None:
        self.settings = settings
        self.email_sender = email_sender
        self.campaigns = campaigns or NotificationCampaignRepository()
        self.deliveries = deliveries or NotificationCampaignDeliveryRepository()

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[NotificationCampaignJobTarget, NotificationCampaignJobInput],
    ) -> NotificationCampaignJobResult | None:
        campaign = await self.deliveries.get_campaign(context.target.campaign_id)
        if campaign is None or campaign.state not in {
            NotificationCampaignState.COMPLETED,
            NotificationCampaignState.PARTIALLY_FAILED,
        }:
            return None
        return _result(campaign, revision=context.input_reference.campaign_revision)

    async def execute(
        self,
        *,
        context: JobExecutionContext[NotificationCampaignJobTarget, NotificationCampaignJobInput],
    ) -> NotificationCampaignJobResult:
        campaign = await self._require_campaign(context.input_reference)
        await context.report_progress(_progress("resolving_audience", 0, None))
        await self.deliveries.begin_dispatch(campaign)
        if not context.input_reference.retry_failed_only:
            await self._create_delivery_ledger(campaign=campaign, context=context)
        await self._deliver(campaign=campaign, context=context)
        await context.report_progress(_progress("settling", 0, None))
        await self.deliveries.settle_campaign(campaign)
        return _result(campaign, revision=context.input_reference.campaign_revision)

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[NotificationCampaignJobTarget, NotificationCampaignJobInput],
        error: JobHandlerTerminalError,
    ) -> None:
        campaign = await self.deliveries.get_campaign(context.target.campaign_id)
        if campaign is None or campaign.state == NotificationCampaignState.CANCELLED:
            return
        _ = error
        await NotificationCampaignRecord.filter(id=campaign.id).update(
            state=NotificationCampaignState.PARTIALLY_FAILED,
            failed_count=max(1, int(campaign.failed_count)),
        )

    async def _require_campaign(self, job_input: NotificationCampaignJobInput) -> NotificationCampaignRecord:
        campaign = await self.deliveries.get_campaign(job_input.campaign_id)
        if campaign is None:
            raise PermanentJobExecutionError(
                code=CAMPAIGN_NOT_FOUND_CODE,
                safe_message="Notification campaign was not found",
            )
        if int(campaign.revision) != job_input.campaign_revision:
            raise PermanentJobExecutionError(
                code=CAMPAIGN_REVISION_MISMATCH_CODE,
                safe_message="Notification campaign revision no longer matches its Job input",
            )
        if campaign.state not in {NotificationCampaignState.SCHEDULED, NotificationCampaignState.DISPATCHING}:
            raise PermanentJobExecutionError(
                code=CAMPAIGN_STATE_INVALID_CODE,
                safe_message="Notification campaign is not dispatchable",
            )
        return campaign

    async def _create_delivery_ledger(
        self,
        *,
        campaign: NotificationCampaignRecord,
        context: JobExecutionContext[NotificationCampaignJobTarget, NotificationCampaignJobInput],
    ) -> None:
        variants = await self.campaigns.list_variants(UUID(str(campaign.id)))
        fallback = next((variant for variant in variants if variant.locale == campaign.fallback_locale), None)
        if fallback is None:
            raise PermanentJobExecutionError(
                code=CAMPAIGN_CONTENT_INVALID_CODE,
                safe_message="Notification campaign fallback variant is missing",
            )
        rule = NotificationAudienceRule.model_validate(campaign.audience)
        offset = 0
        created = 0
        await context.report_progress(_progress("creating_deliveries", 0, None))
        while True:
            users = await self.campaigns.list_audience_page(
                rule,
                offset=offset,
                limit=_AUDIENCE_BATCH_SIZE,
            )
            if not users:
                break
            for user in users:
                await self._create_recipient_deliveries(campaign=campaign, variant=fallback, user=user)
                created += 1
                await context.checkpoint()
            offset += len(users)
            await context.report_progress(_progress("creating_deliveries", created, None))

    async def _create_recipient_deliveries(
        self,
        *,
        campaign: NotificationCampaignRecord,
        variant: NotificationCampaignVariantRecord,
        user: User,
    ) -> None:
        for presentation in (NotificationPresentation(item) for item in campaign.presentations or ()):
            channel = (
                NotificationCampaignChannel.EMAIL
                if presentation == NotificationPresentation.EMAIL
                else NotificationCampaignChannel.IN_APP
            )
            key = delivery_idempotency_key(
                campaign_id=campaign.id,
                campaign_revision=campaign.revision,
                recipient_user_id=user.id,
                presentation=str(presentation),
            )
            await self.deliveries.create_delivery(
                data={
                    "campaign_id": campaign.id,
                    "variant_id": variant.id,
                    "recipient_user_id": user.id,
                    "recipient_locale": variant.locale,
                    "channel": channel,
                    "presentation": presentation,
                    "idempotency_key": key,
                    "state": NotificationDeliveryState.PENDING,
                    "scheduled_at": campaign.schedule_at,
                }
            )

    async def _deliver(
        self,
        *,
        campaign: NotificationCampaignRecord,
        context: JobExecutionContext[NotificationCampaignJobTarget, NotificationCampaignJobInput],
    ) -> None:
        completed = 0
        after_id: UUID | None = None
        await context.report_progress(_progress("delivering", 0, None))
        while True:
            rows = await self.deliveries.list_actionable_deliveries(
                campaign_id=campaign.id,
                retry_failed_only=context.input_reference.retry_failed_only,
                after_id=after_id,
                limit=_DELIVERY_BATCH_SIZE,
            )
            if not rows:
                break
            for delivery in rows:
                await context.checkpoint()
                await self._deliver_one(delivery, campaign=campaign)
                completed += 1
            after_id = UUID(str(rows[-1].id))
            await context.report_progress(_progress("delivering", completed, None))

    async def _deliver_one(
        self,
        delivery: NotificationDeliveryRecord,
        *,
        campaign: NotificationCampaignRecord,
    ) -> None:
        await self.deliveries.mark_processing(delivery)
        variant = await self.deliveries.get_variant(UUID(str(delivery.variant_id)))
        user = await self.deliveries.get_recipient_user(delivery.recipient_user_id)
        if variant is None or user is None:
            await self.deliveries.mark_failed(
                delivery,
                code="NOTIFICATION_CAMPAIGN_DELIVERY_TARGET_MISSING",
                message="Campaign variant or recipient no longer exists",
                is_retryable=False,
            )
            return
        if delivery.channel == NotificationCampaignChannel.EMAIL:
            try:
                await self._deliver_email(delivery=delivery, variant=variant, user=user)
            except Exception as exc:
                await self.deliveries.mark_failed(
                    delivery,
                    code="NOTIFICATION_CAMPAIGN_PROVIDER_UNAVAILABLE",
                    message=str(exc),
                    is_retryable=True,
                )
            return
        await self._deliver_in_app(delivery=delivery, variant=variant, campaign=campaign)

    async def _deliver_email(
        self,
        *,
        delivery: NotificationDeliveryRecord,
        variant: NotificationCampaignVariantRecord,
        user: User,
    ) -> None:
        if not user.email:
            await self.deliveries.mark_failed(
                delivery,
                code="NOTIFICATION_CAMPAIGN_RECIPIENT_EMAIL_MISSING",
                message="Recipient has no email address",
                is_retryable=False,
            )
            return
        if not await is_notification_channel_enabled_for_event(
            user_id=user.id,
            event_name=_GLOBAL_NOTIFICATION_EVENT,
            channel="email",
        ):
            await self.deliveries.mark_suppressed(delivery, reason="NOTIFICATION_EMAIL_PREFERENCE_DISABLED")
            return
        payload = NotificationEmailPayload.model_validate(variant.email_payload)
        result = await self.email_sender.send_template_version(
            recipient=user.email,
            template_key=payload.template_key,
            template_version=payload.template_version,
            locale=variant.locale,
            variables=payload.variables,
            idempotency_key=delivery.idempotency_key,
        )
        if not result.success:
            await self.deliveries.mark_failed(
                delivery,
                code="NOTIFICATION_CAMPAIGN_EMAIL_REJECTED",
                message=result.error or "Email provider rejected the campaign message",
                is_retryable=True,
            )
            return
        await self.deliveries.mark_sent(delivery, provider_message_id=result.message_id)

    async def _deliver_in_app(
        self,
        *,
        delivery: NotificationDeliveryRecord,
        variant: NotificationCampaignVariantRecord,
        campaign: NotificationCampaignRecord,
    ) -> None:
        payload = _presentation_payload(delivery.presentation, variant)
        if not await is_notification_channel_enabled_for_event(
            user_id=delivery.recipient_user_id,
            event_name=_GLOBAL_NOTIFICATION_EVENT,
            channel="in_app",
        ):
            await self.deliveries.mark_suppressed(delivery, reason="NOTIFICATION_IN_APP_PREFERENCE_DISABLED")
            return
        dedupe_key = f"campaign:{delivery.id}"
        record = await create_notification_record(
            settings=self.settings,
            workspace_id=_GLOBAL_NOTIFICATION_WORKSPACE_ID,
            recipient_user_id=delivery.recipient_user_id,
            actor_user_id=None,
            category=NotificationCategory.SYSTEM,
            title=payload.title,
            body=payload.body,
            target_to=_target_to(payload),
            target_meta={
                "campaignId": str(delivery.campaign_id),
                "deliveryId": str(delivery.id),
                "presentation": str(delivery.presentation),
                "priority": int(campaign.priority),
                "displayStartAt": _isoformat(campaign.display_start_at),
                "displayEndAt": _isoformat(campaign.display_end_at),
                "scheduleAt": _isoformat(campaign.schedule_at),
                "payload": payload.model_dump(mode="json", by_alias=True),
            },
            event_name=_GLOBAL_NOTIFICATION_EVENT,
            dedupe_key=dedupe_key,
        )
        if record is None:
            record = await self.deliveries.find_notification(
                recipient_user_id=delivery.recipient_user_id,
                dedupe_key=dedupe_key,
            )
        if record is None:
            await self.deliveries.mark_suppressed(delivery, reason="NOTIFICATION_SYSTEM_POLICY_DISABLED")
            return
        await self.deliveries.mark_delivered(delivery, notification_id=UUID(str(record.id)))


def _presentation_payload(
    presentation: NotificationPresentation,
    variant: NotificationCampaignVariantRecord,
) -> NotificationInboxPayload | NotificationModalPayload | NotificationBannerPayload | NotificationToastPayload:
    schemas = {
        NotificationPresentation.INBOX: (NotificationInboxPayload, variant.inbox_payload),
        NotificationPresentation.MODAL: (NotificationModalPayload, variant.modal_payload),
        NotificationPresentation.BANNER: (NotificationBannerPayload, variant.banner_payload),
        NotificationPresentation.TOAST: (NotificationToastPayload, variant.toast_payload),
    }
    schema_and_value = schemas.get(NotificationPresentation(presentation))
    if schema_and_value is None or schema_and_value[1] is None:
        raise ValueError("NOTIFICATION_CAMPAIGN_PRESENTATION_PAYLOAD_MISSING")
    schema, value = schema_and_value
    return schema.model_validate(value)


def _target_to(payload: Any) -> str:
    action = getattr(payload, "action", None) or getattr(payload, "primary_action", None)
    if action and action.kind == NotificationActionKind.INTERNAL_ROUTE:
        return str(action.target)
    return "/notifications"


def _isoformat(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def _progress(phase: str, completed: int, total: int | None) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"NOTIFICATION_CAMPAIGN_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=total,
    )


def _result(campaign: NotificationCampaignRecord, *, revision: int) -> NotificationCampaignJobResult:
    return NotificationCampaignJobResult(
        campaign_id=campaign.id,
        campaign_revision=revision,
        recipient_count=int(campaign.recipient_count),
        sent_count=int(campaign.sent_count),
        delivered_count=int(campaign.delivered_count),
        failed_count=int(campaign.failed_count),
    )
