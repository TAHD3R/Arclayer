from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignConflictPolicy,
    NotificationPresentation,
)
from src.modules.system.admin.notifications.schema import (
    NotificationAction,
    NotificationActionKind,
    NotificationBannerPayload,
    NotificationDismissPolicy,
    NotificationInboxPayload,
    NotificationMedia,
    NotificationMediaKind,
    NotificationModalPayload,
    NotificationToastPayload,
)

_LOCALE_PATTERN = r"^[a-z]{2}(?:-[A-Z]{2})?$"

__all__ = (
    "NotificationAction",
    "NotificationActionKind",
    "NotificationAudienceKind",
    "NotificationAudienceRule",
    "NotificationBannerPayload",
    "NotificationCampaignCreateRequest",
    "NotificationCampaignEditableFields",
    "NotificationCampaignPatchRequest",
    "NotificationCampaignPublishRequest",
    "NotificationCampaignRevisionRequest",
    "NotificationCampaignVariantInput",
    "NotificationDismissPolicy",
    "NotificationEmailPayload",
    "NotificationInboxPayload",
    "NotificationMedia",
    "NotificationMediaKind",
    "NotificationModalPayload",
    "NotificationToastPayload",
)


class NotificationAudienceKind(StrEnum):
    ALL_ACTIVE_USERS = "all_active_users"
    EXPLICIT_USERS = "explicit_users"
    WORKSPACE_MEMBERS = "workspace_members"


class NotificationAudienceRule(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: NotificationAudienceKind
    user_ids: tuple[PublicUUID, ...] = ()
    workspace_ids: tuple[PublicUUID, ...] = ()
    created_from: datetime | None = None
    created_to: datetime | None = None
    last_active_from: datetime | None = None
    last_active_to: datetime | None = None

    @model_validator(mode="after")
    def validate_kind_fields(self) -> Self:
        if self.kind == NotificationAudienceKind.EXPLICIT_USERS and not self.user_ids:
            raise ValueError("NOTIFICATION_AUDIENCE_USER_IDS_REQUIRED")
        if self.kind != NotificationAudienceKind.EXPLICIT_USERS and self.user_ids:
            raise ValueError("NOTIFICATION_AUDIENCE_USER_IDS_NOT_ALLOWED")
        if self.kind == NotificationAudienceKind.WORKSPACE_MEMBERS and not self.workspace_ids:
            raise ValueError("NOTIFICATION_AUDIENCE_WORKSPACE_IDS_REQUIRED")
        if self.kind != NotificationAudienceKind.WORKSPACE_MEMBERS and self.workspace_ids:
            raise ValueError("NOTIFICATION_AUDIENCE_WORKSPACE_IDS_NOT_ALLOWED")
        if self.created_from and self.created_to and self.created_from >= self.created_to:
            raise ValueError("NOTIFICATION_AUDIENCE_CREATED_RANGE_INVALID")
        if self.last_active_from and self.last_active_to and self.last_active_from >= self.last_active_to:
            raise ValueError("NOTIFICATION_AUDIENCE_LAST_ACTIVE_RANGE_INVALID")
        return self


class NotificationEmailPayload(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    template_key: str = Field(..., min_length=1, max_length=128)
    template_version: int = Field(..., ge=1)
    variables: JsonObject = Field(default_factory=dict)


class NotificationCampaignVariantInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    locale: str = Field(..., pattern=_LOCALE_PATTERN)
    inbox: NotificationInboxPayload | None = None
    email: NotificationEmailPayload | None = None
    modal: NotificationModalPayload | None = None
    banner: NotificationBannerPayload | None = None
    toast: NotificationToastPayload | None = None

    @model_validator(mode="after")
    def require_content(self) -> Self:
        if not any((self.inbox, self.email, self.modal, self.banner, self.toast)):
            raise ValueError("NOTIFICATION_VARIANT_CONTENT_REQUIRED")
        return self


class NotificationCampaignEditableFields(BaseSchema):
    name: str = Field(..., min_length=1, max_length=160)
    internal_description: str | None = Field(default=None, max_length=4000)
    audience: NotificationAudienceRule
    timezone: str = Field(default="UTC", min_length=1, max_length=64)
    display_start_at: datetime | None = None
    display_end_at: datetime | None = None
    priority: int = Field(default=0, ge=-100, le=100)
    conflict_policy: NotificationCampaignConflictPolicy = NotificationCampaignConflictPolicy.QUEUE
    channels: tuple[NotificationCampaignChannel, ...] = ()
    presentations: tuple[NotificationPresentation, ...] = ()
    fallback_locale: str | None = Field(default=None, pattern=_LOCALE_PATTERN)
    variants: tuple[NotificationCampaignVariantInput, ...] = ()

    @field_validator("channels", "presentations")
    @classmethod
    def require_unique_values(cls, values: tuple[Any, ...]) -> tuple[Any, ...]:
        if len(values) != len(set(values)):
            raise ValueError("NOTIFICATION_CAMPAIGN_VALUES_MUST_BE_UNIQUE")
        return values

    @model_validator(mode="after")
    def validate_window_and_locales(self) -> Self:
        if self.display_start_at and self.display_end_at and self.display_start_at >= self.display_end_at:
            raise ValueError("NOTIFICATION_CAMPAIGN_DISPLAY_WINDOW_INVALID")
        locales = [variant.locale for variant in self.variants]
        if len(locales) != len(set(locales)):
            raise ValueError("NOTIFICATION_CAMPAIGN_LOCALE_DUPLICATE")
        if self.fallback_locale and self.fallback_locale not in locales:
            raise ValueError("NOTIFICATION_CAMPAIGN_FALLBACK_LOCALE_MISSING")
        return self


class NotificationCampaignCreateRequest(NotificationCampaignEditableFields):
    pass


class NotificationCampaignPatchRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(..., ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    internal_description: str | None = Field(default=None, max_length=4000)
    audience: NotificationAudienceRule | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    display_start_at: datetime | None = None
    display_end_at: datetime | None = None
    priority: int | None = Field(default=None, ge=-100, le=100)
    conflict_policy: NotificationCampaignConflictPolicy | None = None
    channels: tuple[NotificationCampaignChannel, ...] | None = None
    presentations: tuple[NotificationPresentation, ...] | None = None
    fallback_locale: str | None = Field(default=None, pattern=_LOCALE_PATTERN)
    variants: tuple[NotificationCampaignVariantInput, ...] | None = None


class NotificationCampaignPublishRequest(BaseSchema):
    expected_revision: int = Field(..., ge=1)
    schedule_at: datetime | None = None


class NotificationCampaignRevisionRequest(BaseSchema):
    expected_revision: int = Field(..., ge=1)
