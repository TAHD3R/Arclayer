from __future__ import annotations

from datetime import datetime

from pydantic import Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignState,
    NotificationDeliverySourceKind,
    NotificationDeliveryState,
    NotificationPresentation,
)


class NotificationDeliveryDirectoryCampaignOut(BaseSchema):
    """Campaign context retained with a delivery for Platform drill-down links."""

    id: PublicUUID
    name: str
    revision: int = Field(ge=1)
    state: NotificationCampaignState


class NotificationDeliveryDirectoryRecipientOut(BaseSchema):
    """Safe recipient identity projection; missing user evidence stays explicit."""

    id: PublicUUID
    username: str | None = None
    display_name: str | None = None
    status: str | None = None


class NotificationDeliveryDirectoryTemplateOut(BaseSchema):
    """Committed variant and email-template evidence without exposing variables."""

    variant_id: PublicUUID
    locale: str
    content_revision: int = Field(ge=1)
    template_key: str | None = None
    template_version: int | None = Field(default=None, ge=1)


class NotificationDeliveryDirectoryOut(BaseOut):
    """One persisted Campaign delivery row for the cross-Campaign directory."""

    campaign: NotificationDeliveryDirectoryCampaignOut
    recipient: NotificationDeliveryDirectoryRecipientOut
    template: NotificationDeliveryDirectoryTemplateOut | None = None

    source_kind: NotificationDeliverySourceKind
    source_identity: str
    channel: NotificationCampaignChannel
    presentation: NotificationPresentation
    state: NotificationDeliveryState
    attempt_count: int = Field(ge=0)
    is_retryable: bool

    scheduled_at: datetime | None = None
    processing_at: datetime | None = None
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    read_at: datetime | None = None
    clicked_at: datetime | None = None
    dismissed_at: datetime | None = None
    notification_id: PublicUUID | None = None
    provider_message_id: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    created_at: datetime
    updated_at: datetime
