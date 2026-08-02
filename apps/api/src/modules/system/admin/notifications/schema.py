from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import (
    ConfigDict,
    Field,
    PlainSerializer,
    PlainValidator,
    TypeAdapter,
    ValidationError,
    WithJsonSchema,
    field_validator,
    model_validator,
)

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.common.utils.public_ids import decode_public_id, encode_uuid, is_public_id
from src.models.system.notification import NotificationCategory


def _parse_notification_target_uuid(value: Any) -> UUID:
    if isinstance(value, UUID):
        return value
    if isinstance(value, str):
        raw = value.strip()
        try:
            return UUID(raw)
        except ValueError:
            if is_public_id(raw):
                return decode_public_id(raw)
    raise ValueError("Invalid notification target id")


NotificationTargetUUID = Annotated[
    UUID,
    PlainValidator(_parse_notification_target_uuid),
    PlainSerializer(encode_uuid, return_type=str),
    WithJsonSchema({"type": "string", "pattern": "^[A-Za-z0-9_-]{22}$"}),
]


class NotificationInboxTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["inbox"] = "inbox"


class NotificationWorkspaceSettingsTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["workspace_settings"] = "workspace_settings"
    destination: Literal["general", "plan_usage", "people", "roles"]
    section: Literal["members-table", "pending-invitations", "roles-table"] | None = None

    @model_validator(mode="after")
    def validate_section(self) -> "NotificationWorkspaceSettingsTarget":
        if self.destination in {"general", "plan_usage"} and self.section is not None:
            raise ValueError("NOTIFICATION_WORKSPACE_SETTINGS_SECTION_NOT_ALLOWED")
        if self.destination == "people" and self.section not in {"members-table", "pending-invitations"}:
            raise ValueError("NOTIFICATION_WORKSPACE_PEOPLE_SECTION_REQUIRED")
        if self.destination == "roles" and self.section != "roles-table":
            raise ValueError("NOTIFICATION_WORKSPACE_ROLES_SECTION_REQUIRED")
        return self


class NotificationProjectTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["project"] = "project"
    project_id: NotificationTargetUUID
    destination: Literal["overview", "settings_api", "content_library", "website_releases"]
    entity_id: NotificationTargetUUID | None = None
    focus: Literal["api_key", "preview_token", "content_item", "release"] | None = None

    @model_validator(mode="after")
    def validate_focus(self) -> "NotificationProjectTarget":
        allowed_focus = {
            "overview": {None},
            "settings_api": {None, "api_key", "preview_token"},
            "content_library": {None, "content_item"},
            "website_releases": {None, "release"},
        }
        if self.focus not in allowed_focus[self.destination]:
            raise ValueError("NOTIFICATION_PROJECT_TARGET_FOCUS_INVALID")
        if self.focus is not None and self.entity_id is None:
            raise ValueError("NOTIFICATION_PROJECT_TARGET_ENTITY_REQUIRED")
        if self.destination == "overview" and self.entity_id is not None:
            raise ValueError("NOTIFICATION_PROJECT_TARGET_ENTITY_NOT_ALLOWED")
        return self


class NotificationFeedbackTicketTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["feedback_ticket"] = "feedback_ticket"
    ticket_id: NotificationTargetUUID


NotificationNavigationTarget = Annotated[
    NotificationInboxTarget
    | NotificationWorkspaceSettingsTarget
    | NotificationProjectTarget
    | NotificationFeedbackTicketTarget,
    Field(discriminator="kind"),
]

_notification_navigation_target_adapter = TypeAdapter(NotificationNavigationTarget)


def validate_notification_navigation_target(value: object) -> NotificationNavigationTarget:
    """Parse one persisted or requested target without accepting route strings."""

    try:
        return _notification_navigation_target_adapter.validate_python(value)
    except ValidationError as exc:
        raise ValueError("NOTIFICATION_NAVIGATION_TARGET_INVALID") from exc


def notification_navigation_target_json(target: NotificationNavigationTarget) -> dict[str, object]:
    """Return the canonical JSON shape stored in JSON fields and automation configuration."""

    return _json_storage_value(target.model_dump(mode="python", by_alias=True))


def notification_presentation_json(presentation: "NotificationCampaignSurface") -> dict[str, object]:
    """Return a JSON-safe immutable campaign presentation snapshot."""

    return _json_storage_value(presentation.model_dump(mode="python", by_alias=True))


def _json_storage_value(value: object) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, StrEnum):
        return value.value
    if isinstance(value, dict):
        return {str(key): _json_storage_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_storage_value(item) for item in value]
    if isinstance(value, tuple):
        return [_json_storage_value(item) for item in value]
    return value


class NotificationActionKind(StrEnum):
    INTERNAL_ROUTE = "internal_route"
    EXTERNAL_HTTPS = "external_https"


class NotificationInternalRouteAction(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal[NotificationActionKind.INTERNAL_ROUTE] = NotificationActionKind.INTERNAL_ROUTE
    label: str = Field(..., min_length=1, max_length=80)
    target: NotificationNavigationTarget


class NotificationExternalHttpsAction(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal[NotificationActionKind.EXTERNAL_HTTPS] = NotificationActionKind.EXTERNAL_HTTPS
    label: str = Field(..., min_length=1, max_length=80)
    target: str = Field(..., min_length=1, max_length=1024)

    @field_validator("target")
    @classmethod
    def validate_target(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("NOTIFICATION_EXTERNAL_ACTION_INVALID")
        return value


NotificationAction = Annotated[
    NotificationInternalRouteAction | NotificationExternalHttpsAction,
    Field(discriminator="kind"),
]


class NotificationMediaKind(StrEnum):
    IMAGE = "image"
    VIDEO = "video"


class NotificationMedia(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    asset_id: NotificationTargetUUID
    kind: NotificationMediaKind
    alt_text: str = Field(..., min_length=1, max_length=256)
    poster_asset_id: NotificationTargetUUID | None = None
    captions_asset_id: NotificationTargetUUID | None = None


class NotificationDismissPolicy(StrEnum):
    DISMISSIBLE = "dismissible"
    ACTION_REQUIRED = "action_required"


class NotificationInboxPayload(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    title: str = Field(..., min_length=1, max_length=256)
    body: str | None = Field(default=None, max_length=512)
    severity: str = Field(default="info", pattern=r"^(info|success|warning|error)$")
    action: NotificationAction | None = None


class NotificationModalPayload(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    title: str = Field(..., min_length=1, max_length=256)
    body: str = Field(..., min_length=1, max_length=4000)
    media: NotificationMedia | None = None
    primary_action: NotificationAction
    secondary_action: NotificationAction | None = None
    dismiss_policy: NotificationDismissPolicy = NotificationDismissPolicy.DISMISSIBLE


class NotificationBannerPayload(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    title: str = Field(..., min_length=1, max_length=160)
    body: str | None = Field(default=None, max_length=320)
    action: NotificationAction | None = None
    dismissible: bool = True


class NotificationToastPayload(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    title: str = Field(..., min_length=1, max_length=160)
    body: str | None = Field(default=None, max_length=320)
    action: NotificationAction | None = None


class _NotificationCampaignSurfaceBase(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    campaign_id: NotificationTargetUUID
    delivery_id: NotificationTargetUUID
    priority: int
    display_start_at: datetime | None = None
    display_end_at: datetime | None = None


class NotificationInboxCampaignSurface(_NotificationCampaignSurfaceBase):
    presentation: Literal["inbox"] = "inbox"
    payload: NotificationInboxPayload


class NotificationModalCampaignSurface(_NotificationCampaignSurfaceBase):
    presentation: Literal["modal"] = "modal"
    payload: NotificationModalPayload


class NotificationBannerCampaignSurface(_NotificationCampaignSurfaceBase):
    presentation: Literal["banner"] = "banner"
    payload: NotificationBannerPayload


class NotificationToastCampaignSurface(_NotificationCampaignSurfaceBase):
    presentation: Literal["toast"] = "toast"
    payload: NotificationToastPayload


NotificationCampaignSurface = Annotated[
    NotificationInboxCampaignSurface
    | NotificationModalCampaignSurface
    | NotificationBannerCampaignSurface
    | NotificationToastCampaignSurface,
    Field(discriminator="presentation"),
]


class NotificationOut(BaseOut):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    recipient_user_id: PublicUUID = Field(..., description="Recipient user id.")
    actor_user_id: PublicUUID | None = Field(default=None, description="Actor user id (best-effort).")

    category: NotificationCategory = Field(..., description="Notification category.")
    title: str = Field(..., description="Short title.")
    body: str | None = Field(default=None, description="Notification body; presentation controls its UI treatment.")

    target: NotificationNavigationTarget = Field(..., description="Typed Product Application navigation target.")
    campaign_surface: NotificationCampaignSurface | None = Field(
        default=None,
        description="Immutable typed Campaign presentation snapshot; only system broadcasts carry one.",
    )

    event_name: str | None = Field(default=None, description="Optional event name.")
    dedupe_key: str | None = Field(default=None, description="Optional dedupe key.")

    read_at: datetime | None = Field(default=None, description="Read datetime (UTC) if read.")
    archived_at: datetime | None = Field(default=None, description="Archived datetime (UTC) if archived.")
    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class NotificationPreviewOut(BaseSchema):
    unread_count: int = Field(
        ..., ge=0, description="Total unread notifications for current user in current workspace."
    )
    items: list[NotificationOut] = Field(default_factory=list, description="Latest unread notifications.")


class NotificationListStatus(StrEnum):
    UNREAD = "unread"
    ALL = "all"
    ARCHIVED = "archived"


class NotificationListQuery(BaseSchema):
    status: NotificationListStatus = Field(
        default=NotificationListStatus.UNREAD,
        description="List status filter (unread/all).",
    )
    category: NotificationCategory | None = Field(default=None, description="Filter by category.")


class NotificationReadResult(BaseSchema):
    id: PublicUUID = Field(..., description="Notification id.")
    read_at: datetime | None = Field(default=None, description="Read datetime (UTC).")


class NotificationReadAllResult(BaseSchema):
    total_count: int = Field(..., ge=0, description="Total unread notifications before operation.")
    success_count: int = Field(..., ge=0, description="Updated count (marked as read).")


class NotificationDevSeedRequest(BaseSchema):
    count: int = Field(
        default=8,
        ge=1,
        le=50,
        description="How many demo notifications to create (dev/test only).",
    )


class NotificationDevSeedResult(BaseSchema):
    created_count: int = Field(..., ge=0, description="Created notifications count.")


class NotificationDeleteResult(BaseSchema):
    id: PublicUUID = Field(..., description="Notification id.")


class NotificationArchiveResult(BaseSchema):
    id: PublicUUID = Field(..., description="Notification id.")
    archived_at: datetime | None = Field(default=None, description="Archived datetime (UTC).")


class NotificationInteractionKind(StrEnum):
    READ = "read"
    CLICK = "click"
    DISMISS = "dismiss"


class NotificationInteractionOut(BaseSchema):
    notification_id: PublicUUID
    delivery_id: PublicUUID
    kind: NotificationInteractionKind
    occurred_at: datetime


class NotificationPreferenceChannelOut(BaseSchema):
    enabled: bool = Field(..., description="Whether this channel is currently enabled.")
    supported: bool = Field(..., description="Whether backend currently supports this channel.")
    mutable: bool = Field(..., description="Whether current user can change this channel.")


class NotificationPreferenceTopicOut(BaseSchema):
    key: str = Field(..., description="Stable topic key.")
    category: NotificationCategory = Field(..., description="Notification category for this topic.")
    title_i18n: str = Field(..., description="i18n key for topic title.")
    description_i18n: str = Field(..., description="i18n key for topic description.")
    channels: dict[Literal["in_app", "email"], NotificationPreferenceChannelOut] = Field(
        ...,
        description="Per-channel state for this topic.",
    )


class NotificationPreferencesOut(BaseSchema):
    topics: list[NotificationPreferenceTopicOut] = Field(
        default_factory=list,
        description="All supported notification preference topics.",
    )


class NotificationPreferencePatchIn(BaseSchema):
    topic_key: str = Field(..., description="Topic key to update.")
    channel: Literal["in_app", "email"] = Field(..., description="Channel to update.")
    enabled: bool = Field(..., description="Target enabled value.")
