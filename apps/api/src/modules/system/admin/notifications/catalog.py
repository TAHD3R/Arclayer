from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.models.system.notification import NotificationCategory, NotificationRecord
from src.modules.system.admin.notifications.preferences import is_notification_channel_enabled_for_event
from src.settings.runtime import get_core_settings_value_cached

NotificationGroupKey = Literal["team", "security", "content", "automation", "system"]


class NotificationDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)

    event_name: str
    group: NotificationGroupKey
    category: NotificationCategory
    title_i18n: str
    description_i18n: str
    target_to: str
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
        target_to="/settings/team/members",
    ),
    NotificationDefinition(
        event_name="team.invitation.accepted",
        group="team",
        category=NotificationCategory.TEAM,
        title_i18n="notifications:NOTIFICATIONS_TEAM_INVITE_ACCEPTED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_TEAM_INVITE_ACCEPTED_BODY",
        target_to="/settings/team/members",
    ),
    NotificationDefinition(
        event_name="workspace.invite.email.created",
        group="team",
        category=NotificationCategory.TEAM,
        title_i18n="notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_CREATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_CREATED_BODY",
        target_to="/settings/team/members",
    ),
    NotificationDefinition(
        event_name="workspace.invite.email.updated",
        group="team",
        category=NotificationCategory.TEAM,
        title_i18n="notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_UPDATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_UPDATED_BODY",
        target_to="/settings/team/members",
    ),
    NotificationDefinition(
        event_name="workspace.invite.email.renewed",
        group="team",
        category=NotificationCategory.TEAM,
        title_i18n="notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_RENEWED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_RENEWED_BODY",
        target_to="/settings/team/members",
    ),
    NotificationDefinition(
        event_name="workspace.invite.email.revoked",
        group="team",
        category=NotificationCategory.TEAM,
        title_i18n="notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_REVOKED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_REVOKED_BODY",
        target_to="/settings/team/members",
    ),
    NotificationDefinition(
        event_name="workspace.member.roles.updated",
        group="team",
        category=NotificationCategory.TEAM,
        title_i18n="notifications:NOTIFICATIONS_MEMBER_ROLES_UPDATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_MEMBER_ROLES_UPDATED_BODY",
        target_to="/settings/team/members",
    ),
    NotificationDefinition(
        event_name="workspace.member.status.updated",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_MEMBER_STATUS_ENABLED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_MEMBER_STATUS_ENABLED_BODY",
        target_to="/settings/team/members",
    ),
    NotificationDefinition(
        event_name="workspace.member.password.reset",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_MEMBER_PASSWORD_RESET_TITLE",
        description_i18n="notifications:NOTIFICATIONS_MEMBER_PASSWORD_RESET_BODY",
        target_to="/settings/team/members",
    ),
    NotificationDefinition(
        event_name="project.api_key.rotated",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_API_KEY_ROTATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_API_KEY_ROTATED_BODY",
        target_to="/settings/api-keys",
    ),
    NotificationDefinition(
        event_name="project.api_key.revoked",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_API_KEY_REVOKED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_API_KEY_REVOKED_BODY",
        target_to="/settings/api-keys",
    ),
    NotificationDefinition(
        event_name="project.preview_token.created",
        group="security",
        category=NotificationCategory.SECURITY,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_PREVIEW_TOKEN_CREATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_PREVIEW_TOKEN_CREATED_BODY",
        target_to="/settings/content",
    ),
    NotificationDefinition(
        event_name="project.content.item.workflow.updated",
        group="content",
        category=NotificationCategory.TASK,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_CONTENT_WORKFLOW_UPDATED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_CONTENT_WORKFLOW_UPDATED_BODY",
        target_to="/settings/content",
    ),
    NotificationDefinition(
        event_name="project.release.scheduled_publish.completed",
        group="content",
        category=NotificationCategory.TASK,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_RELEASE_PUBLISH_COMPLETED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_RELEASE_PUBLISH_COMPLETED_BODY",
        target_to="/content/releases",
    ),
    NotificationDefinition(
        event_name="project.release.scheduled_publish.failed",
        group="content",
        category=NotificationCategory.TASK,
        title_i18n="notifications:NOTIFICATIONS_PROJECT_RELEASE_PUBLISH_FAILED_TITLE",
        description_i18n="notifications:NOTIFICATIONS_PROJECT_RELEASE_PUBLISH_FAILED_BODY",
        target_to="/content/releases",
    ),
    NotificationDefinition(
        event_name="automation.notification",
        group="automation",
        category=NotificationCategory.TASK,
        title_i18n="notifications:NOTIFICATIONS_AUTOMATION_NOTIFICATION_TITLE",
        description_i18n="notifications:NOTIFICATIONS_AUTOMATION_NOTIFICATION_BODY",
        target_to="/notifications",
    ),
    NotificationDefinition(
        event_name="system.broadcast",
        group="system",
        category=NotificationCategory.SYSTEM,
        title_i18n="notifications:NOTIFICATIONS_SYSTEM_BROADCAST_TITLE",
        description_i18n="notifications:NOTIFICATIONS_SYSTEM_BROADCAST_BODY",
        target_to="/notifications",
    ),
)

NOTIFICATION_DEFINITION_BY_EVENT: dict[str, NotificationDefinition] = {
    definition.event_name: definition for definition in NOTIFICATION_DEFINITIONS
}


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
    target_to: str | None,
    event_name: str | None,
    actor_user_id: UUID | None = None,
    target_meta: dict[str, object] | None = None,
    dedupe_key: str | None = None,
) -> NotificationRecord | None:
    if not await is_notification_group_enabled_for_event(settings=settings, event_name=event_name):
        return None

    if not await is_notification_channel_enabled_for_event(
        user_id=recipient_user_id,
        event_name=event_name,
        channel="in_app",
    ):
        return None

    try:
        return await NotificationRecord.create(
            workspace_id=workspace_id,
            recipient_user_id=recipient_user_id,
            actor_user_id=actor_user_id,
            category=category,
            title=title,
            body=body,
            target_to=target_to or "/notifications",
            target_meta=target_meta,
            event_name=event_name,
            dedupe_key=dedupe_key,
        )
    except IntegrityError:
        return None
