from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.models.system.notification import NotificationCategory
from src.models.system.setting import SettingRecord
from src.settings.scopes import SCOPE_TYPE_USER

NotificationPreferenceChannel = Literal["in_app", "email"]
NOTIFICATION_PREFERENCES_NAMESPACE = "notifications.me.preferences"


class NotificationTopicDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    key: str
    category: NotificationCategory
    title_i18n: str
    description_i18n: str
    in_app_supported: bool = True
    email_supported: bool = True
    in_app_default: bool = True
    email_default: bool = False


TOPIC_DEFINITIONS: tuple[NotificationTopicDefinition, ...] = (
    NotificationTopicDefinition(
        key="workspace.invitation.accepted",
        category=NotificationCategory.TEAM,
        title_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_DESC",
    ),
    NotificationTopicDefinition(
        key="workspace.invite.email.created",
        category=NotificationCategory.TEAM,
        title_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_CREATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_CREATED_DESC",
    ),
    NotificationTopicDefinition(
        key="workspace.invite.email.updated",
        category=NotificationCategory.TEAM,
        title_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_UPDATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_UPDATED_DESC",
    ),
    NotificationTopicDefinition(
        key="workspace.invite.email.renewed",
        category=NotificationCategory.TEAM,
        title_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_RENEWED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_RENEWED_DESC",
    ),
    NotificationTopicDefinition(
        key="workspace.invite.email.revoked",
        category=NotificationCategory.TEAM,
        title_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_REVOKED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_INVITE_REVOKED_DESC",
    ),
    NotificationTopicDefinition(
        key="workspace.member.status.updated",
        category=NotificationCategory.SECURITY,
        title_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_STATUS_UPDATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_STATUS_UPDATED_DESC",
    ),
    NotificationTopicDefinition(
        key="workspace.member.roles.updated",
        category=NotificationCategory.TEAM,
        title_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_DESC",
    ),
    NotificationTopicDefinition(
        key="workspace.member.password.reset",
        category=NotificationCategory.SECURITY,
        title_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_PASSWORD_RESET_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_PASSWORD_RESET_DESC",
    ),
    NotificationTopicDefinition(
        key="project.api_key.rotated",
        category=NotificationCategory.SECURITY,
        title_i18n="account:ME_NOTIFY_TOPIC_PROJECT_API_KEY_ROTATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_PROJECT_API_KEY_ROTATED_DESC",
    ),
    NotificationTopicDefinition(
        key="project.api_key.revoked",
        category=NotificationCategory.SECURITY,
        title_i18n="account:ME_NOTIFY_TOPIC_PROJECT_API_KEY_REVOKED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_PROJECT_API_KEY_REVOKED_DESC",
    ),
    NotificationTopicDefinition(
        key="project.preview_token.created",
        category=NotificationCategory.SECURITY,
        title_i18n="account:ME_NOTIFY_TOPIC_PROJECT_PREVIEW_TOKEN_CREATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_PROJECT_PREVIEW_TOKEN_CREATED_DESC",
    ),
    NotificationTopicDefinition(
        key="project.content.item.workflow.updated",
        category=NotificationCategory.TASK,
        title_i18n="account:ME_NOTIFY_TOPIC_PROJECT_CONTENT_WORKFLOW_UPDATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_PROJECT_CONTENT_WORKFLOW_UPDATED_DESC",
    ),
    NotificationTopicDefinition(
        key="project.release.scheduled_publish.completed",
        category=NotificationCategory.TASK,
        title_i18n="account:ME_NOTIFY_TOPIC_PROJECT_RELEASE_SCHEDULED_PUBLISH_COMPLETED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_PROJECT_RELEASE_SCHEDULED_PUBLISH_COMPLETED_DESC",
    ),
    NotificationTopicDefinition(
        key="project.release.scheduled_publish.failed",
        category=NotificationCategory.TASK,
        title_i18n="account:ME_NOTIFY_TOPIC_PROJECT_RELEASE_SCHEDULED_PUBLISH_FAILED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_PROJECT_RELEASE_SCHEDULED_PUBLISH_FAILED_DESC",
    ),
    NotificationTopicDefinition(
        key="automation.notification",
        category=NotificationCategory.TASK,
        title_i18n="account:ME_NOTIFY_TOPIC_AUTOMATION_NOTIFICATION_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_AUTOMATION_NOTIFICATION_DESC",
    ),
    NotificationTopicDefinition(
        key="system.mail.updated",
        category=NotificationCategory.SECURITY,
        title_i18n="account:ME_NOTIFY_TOPIC_SYSTEM_MAIL_UPDATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_SYSTEM_MAIL_UPDATED_DESC",
    ),
    NotificationTopicDefinition(
        key="system.storage.updated",
        category=NotificationCategory.SECURITY,
        title_i18n="account:ME_NOTIFY_TOPIC_SYSTEM_STORAGE_UPDATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_SYSTEM_STORAGE_UPDATED_DESC",
    ),
    NotificationTopicDefinition(
        key="system.settings.feature_flags.updated",
        category=NotificationCategory.SECURITY,
        title_i18n="account:ME_NOTIFY_TOPIC_SYSTEM_FEATURE_FLAGS_UPDATED_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_SYSTEM_FEATURE_FLAGS_UPDATED_DESC",
    ),
    NotificationTopicDefinition(
        key="system.broadcast",
        category=NotificationCategory.SYSTEM,
        title_i18n="account:ME_NOTIFY_TOPIC_SYSTEM_BROADCAST_TITLE",
        description_i18n="account:ME_NOTIFY_TOPIC_SYSTEM_BROADCAST_DESC",
        email_supported=True,
    ),
)

TOPIC_BY_KEY = {topic.key: topic for topic in TOPIC_DEFINITIONS}

EVENT_TO_TOPIC_KEY: dict[str, str] = {
    "team.invitation.accepted": "workspace.invitation.accepted",
    "workspace.invitation.accepted": "workspace.invitation.accepted",
    "workspace.invite.email.created": "workspace.invite.email.created",
    "workspace.invite.email.updated": "workspace.invite.email.updated",
    "workspace.invite.email.renewed": "workspace.invite.email.renewed",
    "workspace.invite.email.revoked": "workspace.invite.email.revoked",
    "workspace.member.status.updated": "workspace.member.status.updated",
    "workspace.member.roles.updated": "workspace.member.roles.updated",
    "workspace.member.password.reset": "workspace.member.password.reset",
    "project.api_key.rotated": "project.api_key.rotated",
    "project.api_key.revoked": "project.api_key.revoked",
    "project.preview_token.created": "project.preview_token.created",
    "project.content.item.workflow.updated": "project.content.item.workflow.updated",
    "project.release.scheduled_publish.completed": "project.release.scheduled_publish.completed",
    "project.release.scheduled_publish.failed": "project.release.scheduled_publish.failed",
    "automation.notification": "automation.notification",
    "system.mail.updated": "system.mail.updated",
    "system.storage.updated": "system.storage.updated",
    "system.settings.feature_flags.updated": "system.settings.feature_flags.updated",
    "system.broadcast": "system.broadcast",
}


def _default_topic_state(topic: NotificationTopicDefinition) -> dict[str, bool]:
    return {
        "in_app": bool(topic.in_app_default and topic.in_app_supported),
        "email": bool(topic.email_default and topic.email_supported),
    }


def _normalize_topic_state(
    topic: NotificationTopicDefinition,
    raw: dict[str, object] | None,
) -> dict[str, bool]:
    if not isinstance(raw, dict):
        return _default_topic_state(topic)

    in_app = bool(raw.get("in_app")) if topic.in_app_supported else False
    email = bool(raw.get("email")) if topic.email_supported else False
    return {"in_app": in_app, "email": email}


def _normalize_topics(raw: object) -> dict[str, dict[str, bool]]:
    raw_topics = raw if isinstance(raw, dict) else {}
    raw_topics_dict = cast(dict[str, dict[str, object]], raw_topics)
    out: dict[str, dict[str, bool]] = {}
    for topic in TOPIC_DEFINITIONS:
        topic_raw = raw_topics_dict.get(topic.key)
        out[topic.key] = _normalize_topic_state(topic, topic_raw)
    return out


def is_topic_channel_mutable(topic: NotificationTopicDefinition, channel: NotificationPreferenceChannel) -> bool:
    if channel == "in_app":
        return topic.in_app_supported
    return topic.email_supported


async def load_user_notification_preferences(*, user_id: UUID) -> dict[str, dict[str, bool]]:
    record = await SettingRecord.get_or_none(
        scope_type=SCOPE_TYPE_USER,
        scope_id=user_id,
        namespace=NOTIFICATION_PREFERENCES_NAMESPACE,
    )
    value = record.value if record and isinstance(record.value, dict) else {}
    return _normalize_topics(value.get("topics"))


async def save_user_notification_preference(
    *,
    user_id: UUID,
    topic_key: str,
    channel: NotificationPreferenceChannel,
    enabled: bool,
) -> dict[str, dict[str, bool]]:
    topic = TOPIC_BY_KEY.get(topic_key)
    if topic is None:
        raise ValueError("UNKNOWN_TOPIC")
    if channel not in {"in_app", "email"}:
        raise ValueError("UNKNOWN_CHANNEL")
    if not is_topic_channel_mutable(topic, channel):
        raise ValueError("CHANNEL_NOT_SUPPORTED")

    current = await load_user_notification_preferences(user_id=user_id)
    topic_state = current.get(topic_key, _default_topic_state(topic))
    next_state = {**topic_state, channel: bool(enabled)}
    next_topics = {**current, topic_key: next_state}

    record = await SettingRecord.get_or_none(
        scope_type=SCOPE_TYPE_USER,
        scope_id=user_id,
        namespace=NOTIFICATION_PREFERENCES_NAMESPACE,
    )
    next_value = {"topics": next_topics}
    if record is None:
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_USER,
            scope_id=user_id,
            namespace=NOTIFICATION_PREFERENCES_NAMESPACE,
            value=next_value,
            updated_by=user_id,
        )
        return next_topics

    record.value = next_value
    record.updated_by = user_id
    await record.save(update_fields=["value", "updated_by", "updated_at"])
    return next_topics


async def is_notification_channel_enabled_for_event(
    *,
    user_id: UUID,
    event_name: str | None,
    channel: NotificationPreferenceChannel,
) -> bool:
    normalized_event = str(event_name or "").strip()
    if not normalized_event:
        return True

    topic_key = EVENT_TO_TOPIC_KEY.get(normalized_event)
    if topic_key is None:
        return True

    topic = TOPIC_BY_KEY.get(topic_key)
    if topic is None:
        return True

    if not is_topic_channel_mutable(topic, channel):
        return False

    state = await load_user_notification_preferences(user_id=user_id)
    topic_state = state.get(topic_key, _default_topic_state(topic))
    return bool(topic_state.get(channel))
