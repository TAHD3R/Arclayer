from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.models.system.notification import NotificationCategory, NotificationRecord
from src.modules.system.admin.notifications.preferences import is_notification_channel_enabled_for_event
from src.modules.system.admin.notifications.schema import (
    NotificationCampaignSurface,
    NotificationInboxTarget,
    NotificationNavigationTarget,
    NotificationWorkspaceSettingsTarget,
    notification_navigation_target_json,
    notification_presentation_json,
)
from src.settings.runtime import get_core_settings_value_cached

NotificationGroupKey = Literal["team", "security", "content", "automation", "system"]


class NotificationProjectTargetTemplate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["project"] = "project"
    destination: Literal["overview", "settings_api", "content_library", "website_releases"]
    focus: Literal["api_key", "preview_token", "content_item", "release"] | None = None

    @model_validator(mode="after")
    def validate_focus(self) -> "NotificationProjectTargetTemplate":
        allowed_focus = {
            "overview": {None},
            "settings_api": {None, "api_key", "preview_token"},
            "content_library": {None, "content_item"},
            "website_releases": {None, "release"},
        }
        if self.focus not in allowed_focus[self.destination]:
            raise ValueError("NOTIFICATION_PROJECT_TARGET_TEMPLATE_FOCUS_INVALID")
        return self


NotificationTargetTemplate = Annotated[
    NotificationInboxTarget | NotificationWorkspaceSettingsTarget | NotificationProjectTargetTemplate,
    Field(discriminator="kind"),
]


class NotificationDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)

    event_name: str
    group: NotificationGroupKey
    category: NotificationCategory
    title_i18n: str
    description_i18n: str
    target: NotificationTargetTemplate
    in_app_supported: bool = True


NOTIFICATION_GROUP_DEFAULTS: dict[NotificationGroupKey, bool] = {
    "team": True,
    "security": True,
    "content": True,
    "automation": True,
    "system": False,
}

NOTIFICATION_DEFINITIONS: tuple[NotificationDefinition, ...] = (
    NotificationDefinition(
        event_name="workspace.invitation.accepted",
        group="team",
        category=NotificationCategory.TEAM,
        title_i18n="notifications:NOTIFICATIONS_TEAM_INVITE_ACCEPTED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_TEAM_INVITE_ACCEPTED_BODY",
        target=NotificationWorkspaceSettingsTarget(destination="people", section="members-table"),
    ),
    NotificationDefinition(
        event_name="team.invitation.accepted",
        group="team",
        category=NotificationCategory.TEAM,
        title_i18n="notifications:NOTIFICATIONS_TEAM_INVITE_ACCEPTED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_TEAM_INVITE_ACCEPTED_BODY",
        target=NotificationWorkspaceSettingsTarget(destination="people", section="members-table"),
    ),
    *(
        NotificationDefinition(
            event_name=event_name,
            group="team",
            category=NotificationCategory.TEAM,
            title_i18n=title_i18n,
            description_i18n="notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_UPDATED_BODY",
            target=NotificationWorkspaceSettingsTarget(destination="people", section="pending-invitations"),
        )
        for event_name, title_i18n in (
            (
                "workspace.invite.email.created",
                "notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_CREATED_TITLE",
            ),
            (
                "workspace.invite.email.updated",
                "notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_UPDATED_TITLE",
            ),
            (
                "workspace.invite.email.renewed",
                "notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_RENEWED_TITLE",
            ),
            (
                "workspace.invite.email.revoked",
                "notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_REVOKED_TITLE",
            ),
        )
    ),
    NotificationDefinition(
        event_name="workspace.member.roles.updated",
        group="team",
        category=NotificationCategory.TEAM,
        title_i18n="notifications:NOTIFICATIONS_MEMBER_ROLES_UPDATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_MEMBER_ROLES_UPDATED_BODY",
        target=NotificationWorkspaceSettingsTarget(destination="people", section="members-table"),
    ),
    NotificationDefinition(
        event_name="workspace.member.status.updated",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_MEMBER_STATUS_ENABLED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_MEMBER_STATUS_ENABLED_BODY",
        target=NotificationWorkspaceSettingsTarget(destination="people", section="members-table"),
    ),
    NotificationDefinition(
        event_name="workspace.member.password.reset",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_MEMBER_PASSWORD_RESET_TITLE",
        description_i18n="notifications:NOTIFICATIONS_MEMBER_PASSWORD_RESET_BODY",
        target=NotificationWorkspaceSettingsTarget(destination="people", section="members-table"),
    ),
    NotificationDefinition(
        event_name="project.api_key.rotated",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_API_KEY_ROTATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_API_KEY_ROTATED_BODY",
        target=NotificationProjectTargetTemplate(destination="settings_api", focus="api_key"),
    ),
    NotificationDefinition(
        event_name="project.api_key.revoked",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_API_KEY_REVOKED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_API_KEY_REVOKED_BODY",
        target=NotificationProjectTargetTemplate(destination="settings_api", focus="api_key"),
    ),
    NotificationDefinition(
        event_name="project.preview_token.created",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_PREVIEW_TOKEN_CREATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_PREVIEW_TOKEN_CREATED_BODY",
        target=NotificationProjectTargetTemplate(destination="settings_api", focus="preview_token"),
    ),
    NotificationDefinition(
        event_name="project.content.item.workflow.updated",
        group="content",
        category=NotificationCategory.TASK,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_CONTENT_WORKFLOW_UPDATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_CONTENT_WORKFLOW_UPDATED_BODY",
        target=NotificationProjectTargetTemplate(destination="content_library", focus="content_item"),
    ),
    *(
        NotificationDefinition(
            event_name=event_name,
            group="content",
            category=NotificationCategory.TASK,
            title_i18n=title_i18n,
            description_i18n=description_i18n,
            target=NotificationProjectTargetTemplate(destination="website_releases", focus="release"),
        )
        for event_name, title_i18n, description_i18n in (
            (
                "project.release.scheduled_publish.completed",
                "notifications:NOTIFICATIONS_PROJECT_RELEASE_PUBLISH_COMPLETED_TITLE",
                "notifications:NOTIFICATIONS_PROJECT_RELEASE_PUBLISH_COMPLETED_BODY",
            ),
            (
                "project.release.scheduled_publish.failed",
                "notifications:NOTIFICATIONS_PROJECT_RELEASE_PUBLISH_FAILED_TITLE",
                "notifications:NOTIFICATIONS_PROJECT_RELEASE_PUBLISH_FAILED_BODY",
            ),
        )
    ),
    NotificationDefinition(
        event_name="automation.notification",
        group="automation",
        category=NotificationCategory.TASK,
        title_i18n="notifications:NOTIFICATIONS_AUTOMATION_NOTIFICATION_TITLE",
        description_i18n="notifications:NOTIFICATIONS_AUTOMATION_NOTIFICATION_BODY",
        target=NotificationInboxTarget(),
    ),
    NotificationDefinition(
        event_name="commerce.lifecycle.committed",
        group="system",
        category=NotificationCategory.SYSTEM,
        title_i18n="notifications:NOTIFICATIONS_COMMERCE_LIFECYCLE_TITLE",
        description_i18n="notifications:NOTIFICATIONS_COMMERCE_LIFECYCLE_BODY",
        target=NotificationWorkspaceSettingsTarget(destination="plan_usage"),
    ),
    NotificationDefinition(
        event_name="feedback.ticket.reply",
        group="system",
        category=NotificationCategory.SYSTEM,
        title_i18n="notifications:NOTIFICATIONS_FEEDBACK_TICKET_REPLY_TITLE",
        description_i18n="notifications:NOTIFICATIONS_FEEDBACK_TICKET_REPLY_BODY",
        target=NotificationInboxTarget(),
    ),
    NotificationDefinition(
        event_name="system.broadcast",
        group="system",
        category=NotificationCategory.SYSTEM,
        title_i18n="notifications:NOTIFICATIONS_SYSTEM_BROADCAST_TITLE",
        description_i18n="notifications:NOTIFICATIONS_SYSTEM_BROADCAST_BODY",
        target=NotificationInboxTarget(),
    ),
)

NOTIFICATION_DEFINITION_BY_EVENT: dict[str, NotificationDefinition] = {
    definition.event_name: definition for definition in NOTIFICATION_DEFINITIONS
}


class NotificationRecordCreateDisposition(StrEnum):
    CREATED = "created"
    GROUP_SUPPRESSED = "group_suppressed"
    PREFERENCE_SUPPRESSED = "preference_suppressed"
    DEDUPLICATED = "deduplicated"


@dataclass(frozen=True)
class NotificationRecordCreateResult:
    disposition: NotificationRecordCreateDisposition
    record: NotificationRecord | None


def get_notification_definition(event_name: str | None) -> NotificationDefinition | None:
    normalized = str(event_name or "").strip()
    if not normalized:
        return None
    return NOTIFICATION_DEFINITION_BY_EVENT.get(normalized)


async def is_notification_group_enabled_for_event(*, settings: Settings, event_name: str | None) -> bool:
    definition = get_notification_definition(event_name)
    if definition is None:
        return True

    core = await get_core_settings_value_cached(settings)
    notifications = core.get("notifications") if isinstance(core, dict) else None
    if not isinstance(notifications, dict):
        return NOTIFICATION_GROUP_DEFAULTS[definition.group]

    groups = dict(notifications).get("groups")
    if not isinstance(groups, dict):
        return NOTIFICATION_GROUP_DEFAULTS[definition.group]

    group_value = groups.get(definition.group)
    if not isinstance(group_value, dict):
        return NOTIFICATION_GROUP_DEFAULTS[definition.group]

    enabled = group_value.get("enabled")
    if isinstance(enabled, bool):
        return enabled
    return NOTIFICATION_GROUP_DEFAULTS[definition.group]


async def create_notification_record(
    *,
    settings: Settings,
    workspace_id: UUID,
    recipient_user_id: UUID,
    category: NotificationCategory,
    title: str,
    body: str | None,
    target: NotificationNavigationTarget,
    event_name: str | None,
    actor_user_id: UUID | None = None,
    dedupe_key: str | None = None,
    campaign_surface: NotificationCampaignSurface | None = None,
) -> NotificationRecordCreateResult:
    _validate_campaign_surface(event_name=event_name, campaign_surface=campaign_surface)
    if not await is_notification_group_enabled_for_event(settings=settings, event_name=event_name):
        return NotificationRecordCreateResult(
            disposition=NotificationRecordCreateDisposition.GROUP_SUPPRESSED,
            record=None,
        )

    if not await is_notification_channel_enabled_for_event(
        user_id=recipient_user_id,
        event_name=event_name,
        channel="in_app",
    ):
        return NotificationRecordCreateResult(
            disposition=NotificationRecordCreateDisposition.PREFERENCE_SUPPRESSED,
            record=None,
        )

    try:
        record = await NotificationRecord.create(
            workspace_id=workspace_id,
            recipient_user_id=recipient_user_id,
            actor_user_id=actor_user_id,
            category=category,
            title=title,
            body=body,
            target=notification_navigation_target_json(target),
            campaign_surface=(
                notification_presentation_json(campaign_surface) if campaign_surface is not None else None
            ),
            event_name=event_name,
            dedupe_key=dedupe_key,
        )
    except IntegrityError:
        return NotificationRecordCreateResult(
            disposition=NotificationRecordCreateDisposition.DEDUPLICATED,
            record=None,
        )
    return NotificationRecordCreateResult(
        disposition=NotificationRecordCreateDisposition.CREATED,
        record=record,
    )


def _validate_campaign_surface(
    *,
    event_name: str | None,
    campaign_surface: NotificationCampaignSurface | None,
) -> None:
    is_system_broadcast = event_name == "system.broadcast"
    if is_system_broadcast and campaign_surface is None:
        raise ValueError("NOTIFICATION_CAMPAIGN_SURFACE_REQUIRED")
    if not is_system_broadcast and campaign_surface is not None:
        raise ValueError("NOTIFICATION_CAMPAIGN_SURFACE_EVENT_INVALID")
