from __future__ import annotations

from typing import Any
from uuid import UUID

from src.models.system.notification_campaign import NotificationCampaignRecord, NotificationCampaignVariantRecord
from src.modules.system.admin.notifications.campaign_contracts import (
    NotificationAudienceRule,
    NotificationBannerPayload,
    NotificationCampaignVariantInput,
    NotificationEmailPayload,
    NotificationInboxPayload,
    NotificationModalPayload,
    NotificationToastPayload,
)
from src.modules.system.admin.notifications.campaign_schema import (
    NotificationCampaignDetailOut,
    NotificationCampaignMetricsOut,
    NotificationCampaignOwnerOut,
    NotificationCampaignSummaryOut,
    NotificationCampaignVariantOut,
)


def variant_input_to_record_data(
    variant: NotificationCampaignVariantInput,
    *,
    fallback_locale: str | None,
    revision: int,
) -> dict[str, Any]:
    return {
        "locale": variant.locale,
        "revision": revision,
        "is_fallback": variant.locale == fallback_locale,
        "inbox_payload": _dump(variant.inbox),
        "email_payload": _dump(variant.email),
        "modal_payload": _dump(variant.modal),
        "banner_payload": _dump(variant.banner),
        "toast_payload": _dump(variant.toast),
    }


def campaign_summary_out(campaign: NotificationCampaignRecord, *, owner: Any) -> NotificationCampaignSummaryOut:
    return NotificationCampaignSummaryOut(
        id=UUID(str(campaign.id)),
        name=str(campaign.name),
        internal_description=campaign.internal_description,
        owner=NotificationCampaignOwnerOut(
            id=UUID(str(owner.id)),
            username=str(owner.username),
            display_name=owner.display_name,
            avatar_url=owner.avatar_url,
        ),
        revision=int(campaign.revision),
        state=campaign.state,
        audience=NotificationAudienceRule.model_validate(campaign.audience),
        audience_estimate=campaign.audience_estimate,
        schedule_at=campaign.schedule_at,
        timezone=str(campaign.timezone),
        display_start_at=campaign.display_start_at,
        display_end_at=campaign.display_end_at,
        priority=int(campaign.priority),
        conflict_policy=campaign.conflict_policy,
        channels=tuple(campaign.channels or ()),
        presentations=tuple(campaign.presentations or ()),
        fallback_locale=campaign.fallback_locale,
        operation_job_id=campaign.operation_job_id,
        metrics=NotificationCampaignMetricsOut(
            recipients=int(campaign.recipient_count),
            pending=int(campaign.pending_count),
            sent=int(campaign.sent_count),
            delivered=int(campaign.delivered_count),
            failed=int(campaign.failed_count),
            suppressed=int(campaign.suppressed_count),
            read=int(campaign.read_count),
            clicked=int(campaign.clicked_count),
            dismissed=int(campaign.dismissed_count),
        ),
        published_at=campaign.published_at,
        completed_at=campaign.completed_at,
        cancelled_at=campaign.cancelled_at,
        archived_at=campaign.archived_at,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
    )


def campaign_detail_out(
    campaign: NotificationCampaignRecord,
    *,
    owner: Any,
    variants: list[NotificationCampaignVariantRecord],
) -> NotificationCampaignDetailOut:
    summary = campaign_summary_out(campaign, owner=owner)
    return NotificationCampaignDetailOut(
        **summary.model_dump(),
        variants=[campaign_variant_out(variant) for variant in variants],
    )


def campaign_variant_out(variant: NotificationCampaignVariantRecord) -> NotificationCampaignVariantOut:
    return NotificationCampaignVariantOut(
        id=UUID(str(variant.id)),
        campaign_id=UUID(str(variant.campaign_id)),
        locale=str(variant.locale),
        revision=int(variant.revision),
        is_fallback=bool(variant.is_fallback),
        inbox=_validate(NotificationInboxPayload, variant.inbox_payload),
        email=_validate(NotificationEmailPayload, variant.email_payload),
        modal=_validate(NotificationModalPayload, variant.modal_payload),
        banner=_validate(NotificationBannerPayload, variant.banner_payload),
        toast=_validate(NotificationToastPayload, variant.toast_payload),
        created_at=variant.created_at,
        updated_at=variant.updated_at,
    )


def _dump(value: Any | None) -> dict[str, Any] | None:
    return value.model_dump(mode="json", by_alias=True) if value is not None else None


def _validate(schema: type[Any], value: Any | None) -> Any | None:
    return schema.model_validate(value) if value is not None else None
