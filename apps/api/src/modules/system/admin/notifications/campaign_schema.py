from __future__ import annotations

from datetime import datetime

from pydantic import Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignConflictPolicy,
    NotificationCampaignState,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.system.admin.notifications.campaign_contracts import (
    NotificationAudienceRule,
    NotificationBannerPayload,
    NotificationEmailPayload,
    NotificationInboxPayload,
    NotificationModalPayload,
    NotificationToastPayload,
)


class NotificationCampaignOwnerOut(BaseSchema):
    id: PublicUUID
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


class NotificationCampaignMetricsOut(BaseSchema):
    recipients: int = Field(ge=0)
    pending: int = Field(ge=0)
    sent: int = Field(ge=0)
    delivered: int = Field(ge=0)
    failed: int = Field(ge=0)
    suppressed: int = Field(ge=0)
    read: int = Field(ge=0)
    clicked: int = Field(ge=0)
    dismissed: int = Field(ge=0)


class NotificationCampaignVariantOut(BaseOut):
    campaign_id: PublicUUID
    locale: str
    revision: int
    is_fallback: bool
    inbox: NotificationInboxPayload | None = None
    email: NotificationEmailPayload | None = None
    modal: NotificationModalPayload | None = None
    banner: NotificationBannerPayload | None = None
    toast: NotificationToastPayload | None = None
    created_at: datetime
    updated_at: datetime


class NotificationCampaignSummaryOut(BaseOut):
    name: str
    internal_description: str | None = None
    owner: NotificationCampaignOwnerOut
    revision: int
    state: NotificationCampaignState
    audience: NotificationAudienceRule
    audience_estimate: int | None = None
    schedule_at: datetime | None = None
    timezone: str
    display_start_at: datetime | None = None
    display_end_at: datetime | None = None
    priority: int
    conflict_policy: NotificationCampaignConflictPolicy
    channels: tuple[NotificationCampaignChannel, ...]
    presentations: tuple[NotificationPresentation, ...]
    fallback_locale: str | None = None
    operation_job_id: PublicUUID | None = None
    metrics: NotificationCampaignMetricsOut
    published_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class NotificationCampaignDetailOut(NotificationCampaignSummaryOut):
    variants: list[NotificationCampaignVariantOut]


class NotificationAudienceEstimateOut(BaseSchema):
    campaign_id: PublicUUID
    revision: int
    estimated_recipients: int = Field(ge=0)
    breakdown: dict[str, int] = Field(default_factory=dict)
    sampled_user_ids: tuple[PublicUUID, ...] = ()


class NotificationCampaignPreviewVariantOut(BaseSchema):
    locale: str
    used_fallback: bool
    presentations: dict[NotificationPresentation, JsonObject]


class NotificationCampaignPreviewOut(BaseSchema):
    campaign_id: PublicUUID
    revision: int
    variants: list[NotificationCampaignPreviewVariantOut]
    warnings: list[str] = Field(default_factory=list)


class NotificationCampaignPublishOut(BaseSchema):
    campaign: NotificationCampaignSummaryOut
    job_id: PublicUUID
    scheduled_at: datetime


class NotificationCampaignCancellationOut(BaseSchema):
    campaign: NotificationCampaignSummaryOut
    cancelled_deliveries: int = Field(ge=0)
    non_recallable_deliveries: int = Field(ge=0)


class NotificationDeliveryOut(BaseOut):
    campaign_id: PublicUUID
    variant_id: PublicUUID
    recipient_user_id: PublicUUID
    recipient_locale: str
    channel: NotificationCampaignChannel
    presentation: NotificationPresentation
    state: NotificationDeliveryState
    attempt_count: int = Field(ge=0)
    scheduled_at: datetime | None = None
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    read_at: datetime | None = None
    clicked_at: datetime | None = None
    dismissed_at: datetime | None = None
    provider_message_id: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    is_retryable: bool
    created_at: datetime
    updated_at: datetime


class NotificationCampaignRetryOut(BaseSchema):
    campaign_id: PublicUUID
    job_id: PublicUUID
    retryable_delivery_count: int = Field(ge=0)
