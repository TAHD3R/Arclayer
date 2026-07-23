export type ActivityEventLevel = "info" | "warning" | "danger";

export type ActivityEventCatalogEntry = {
  /**
   * i18n key in `activity` namespace.
   * We intentionally avoid dots in keys to keep i18next default keySeparator behavior.
   */
  titleKey: string;
  descriptionKey?: string;
  level?: ActivityEventLevel;
};

function createCatalogEntry(
  keyStem: string,
  level: ActivityEventLevel = "info",
): ActivityEventCatalogEntry {
  return {
    titleKey: `ACTIVITY_EVENT_${keyStem}_TITLE`,
    descriptionKey: `ACTIVITY_EVENT_${keyStem}_DESC`,
    level,
  };
}

/**
 * 事件语义字典（前端权威）：用于把 event_name 翻译成“产品化”文案。
 *
 * 说明：
 * - 这里的 key 必须与后端写入的 event_name 完全一致（精确匹配）。
 * - i18n key 放在 `locales/<locale>/activity.json` 中维护中英文同步。
 */
export const ACTIVITY_EVENT_CATALOG: Record<string, ActivityEventCatalogEntry> = {
  // Auth
  "auth.login.succeeded": {
    titleKey: "ACTIVITY_EVENT_AUTH_LOGIN_SUCCEEDED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_AUTH_LOGIN_SUCCEEDED_DESC",
    level: "info",
  },
  "auth.password.reset.requested": {
    titleKey: "ACTIVITY_EVENT_AUTH_PASSWORD_RESET_REQUESTED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_AUTH_PASSWORD_RESET_REQUESTED_DESC",
    level: "warning",
  },
  "auth.password.reset.completed": {
    titleKey: "ACTIVITY_EVENT_AUTH_PASSWORD_RESET_COMPLETED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_AUTH_PASSWORD_RESET_COMPLETED_DESC",
    level: "warning",
  },
  "auth.login": createCatalogEntry("AUTH_LOGIN"),
  "auth.password.updated": createCatalogEntry("AUTH_PASSWORD_UPDATED", "warning"),
  "auth.account.deleted": createCatalogEntry("AUTH_ACCOUNT_DELETED", "danger"),
  "auth.session.revoked": createCatalogEntry("AUTH_SESSION_REVOKED", "warning"),
  "auth.mfa.enabled": createCatalogEntry("AUTH_MFA_ENABLED"),
  "auth.mfa.disabled": createCatalogEntry("AUTH_MFA_DISABLED", "warning"),
  "auth.mfa.backup_codes_regenerated": createCatalogEntry(
    "AUTH_MFA_BACKUP_CODES_REGENERATED",
    "warning",
  ),
  "auth.sso.linked": createCatalogEntry("AUTH_SSO_LINKED"),
  "auth.sso.unlinked": createCatalogEntry("AUTH_SSO_UNLINKED", "warning"),

  // Workspace / Team
  "workspace.member.status.updated": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_MEMBER_STATUS_UPDATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_MEMBER_STATUS_UPDATED_DESC",
    level: "warning",
  },
  "workspace.member.roles.updated": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_MEMBER_ROLES_UPDATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_MEMBER_ROLES_UPDATED_DESC",
    level: "info",
  },
  "workspace.member.profile.updated": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_MEMBER_PROFILE_UPDATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_MEMBER_PROFILE_UPDATED_DESC",
    level: "info",
  },
  "workspace.member.password.reset": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_MEMBER_PASSWORD_RESET_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_MEMBER_PASSWORD_RESET_DESC",
    level: "warning",
  },
  "workspace.invite.email.created": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_EMAIL_CREATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_EMAIL_CREATED_DESC",
    level: "info",
  },
  "workspace.invite.email.updated": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_EMAIL_UPDATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_EMAIL_UPDATED_DESC",
    level: "info",
  },
  "workspace.invite.email.renewed": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_EMAIL_RENEWED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_EMAIL_RENEWED_DESC",
    level: "info",
  },
  "workspace.invite.email.revoked": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_EMAIL_REVOKED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_EMAIL_REVOKED_DESC",
    level: "warning",
  },
  "workspace.invite.link.created": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_LINK_CREATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_LINK_CREATED_DESC",
    level: "info",
  },
  "workspace.invite.link.renewed": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_LINK_RENEWED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_LINK_RENEWED_DESC",
    level: "info",
  },
  "workspace.invite.link.disabled": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_LINK_DISABLED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_LINK_DISABLED_DESC",
    level: "warning",
  },
  "workspace.invite.accepted": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_ACCEPTED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_INVITE_ACCEPTED_DESC",
    level: "info",
  },
  "workspace.content.item.created": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_CREATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_CREATED_DESC",
    level: "info",
  },
  "workspace.content.item.duplicated": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_DUPLICATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_DUPLICATED_DESC",
    level: "info",
  },
  "workspace.content.item.deleted": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_DELETED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_DELETED_DESC",
    level: "warning",
  },
  "workspace.content.item.archived": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_ARCHIVED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_ARCHIVED_DESC",
    level: "warning",
  },
  "workspace.content.item.unarchived": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_UNARCHIVED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_UNARCHIVED_DESC",
    level: "info",
  },
  "workspace.content.item.bootstrap.applied": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_BOOTSTRAP_APPLIED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_ITEM_BOOTSTRAP_APPLIED_DESC",
    level: "info",
  },
  "workspace.content.version.saved": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_SAVED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_SAVED_DESC",
    level: "info",
  },
  "workspace.content.version.patched": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_PATCHED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_PATCHED_DESC",
    level: "info",
  },
  "workspace.content.version.published": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_PUBLISHED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_PUBLISHED_DESC",
    level: "info",
  },
  "workspace.content.version.scheduled": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_SCHEDULED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_SCHEDULED_DESC",
    level: "info",
  },
  "workspace.content.version.archived": {
    titleKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_ARCHIVED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_WORKSPACE_CONTENT_VERSION_ARCHIVED_DESC",
    level: "warning",
  },

  // Organization / Workspace lifecycle
  "organization.invite.accepted": createCatalogEntry("ORGANIZATION_INVITE_ACCEPTED"),
  "organization.member.invited": createCatalogEntry("ORGANIZATION_MEMBER_INVITED"),
  "organization.member.role_updated": createCatalogEntry(
    "ORGANIZATION_MEMBER_ROLE_UPDATED",
    "warning",
  ),
  "organization.member.removed": createCatalogEntry("ORGANIZATION_MEMBER_REMOVED", "warning"),
  "organization.settings.updated": createCatalogEntry("ORGANIZATION_SETTINGS_UPDATED", "warning"),
  "workspace.invitation.accepted": createCatalogEntry("WORKSPACE_INVITATION_ACCEPTED"),
  "workspace.created": createCatalogEntry("WORKSPACE_CREATED"),
  "workspace.updated": createCatalogEntry("WORKSPACE_UPDATED"),
  "workspace.archived": createCatalogEntry("WORKSPACE_ARCHIVED", "warning"),
  "workspace.deleted": createCatalogEntry("WORKSPACE_DELETED", "danger"),
  "settings.workspace.core.updated": createCatalogEntry(
    "SETTINGS_WORKSPACE_CORE_UPDATED",
    "warning",
  ),
  "permission.assignment.changed": createCatalogEntry("PERMISSION_ASSIGNMENT_CHANGED", "warning"),

  // Commerce
  "commerce.plan.updated": createCatalogEntry("COMMERCE_PLAN_UPDATED", "warning"),
  "commerce.subscription.updated": createCatalogEntry("COMMERCE_SUBSCRIPTION_UPDATED", "warning"),
  "commerce.subscription_change.requested": createCatalogEntry(
    "COMMERCE_SUBSCRIPTION_CHANGE_REQUESTED",
    "warning",
  ),
  "commerce.subscription_change.approved": createCatalogEntry(
    "COMMERCE_SUBSCRIPTION_CHANGE_APPROVED",
  ),
  "commerce.subscription_change.rejected": createCatalogEntry(
    "COMMERCE_SUBSCRIPTION_CHANGE_REJECTED",
    "warning",
  ),

  // Feedback
  "feedback.submitted": createCatalogEntry("FEEDBACK_SUBMITTED"),
  "feedback.updated": createCatalogEntry("FEEDBACK_UPDATED"),
  "feedback.message.added": createCatalogEntry("FEEDBACK_MESSAGE_ADDED"),

  // Project / Delivery
  "project.created": createCatalogEntry("PROJECT_CREATED"),
  "project.updated": createCatalogEntry("PROJECT_UPDATED"),
  "project.archived": createCatalogEntry("PROJECT_ARCHIVED", "warning"),
  "project.deleted": createCatalogEntry("PROJECT_DELETED", "danger"),
  "project.settings.updated": createCatalogEntry("PROJECT_SETTINGS_UPDATED", "warning"),
  "project.environment.updated": createCatalogEntry("PROJECT_ENVIRONMENT_UPDATED", "warning"),
  "project.builder.change_set.previewed": createCatalogEntry(
    "PROJECT_BUILDER_CHANGE_SET_PREVIEWED",
  ),
  "project.builder.change_set.applied": createCatalogEntry("PROJECT_BUILDER_CHANGE_SET_APPLIED"),
  "deployment.promoted": createCatalogEntry("DEPLOYMENT_PROMOTED"),
  "deployment.failed": createCatalogEntry("DEPLOYMENT_FAILED", "danger"),
  "release.published": createCatalogEntry("RELEASE_PUBLISHED"),
  "release.rolled_back": createCatalogEntry("RELEASE_ROLLED_BACK", "warning"),
  "project.release.scheduled_publish.completed": createCatalogEntry(
    "PROJECT_RELEASE_SCHEDULED_PUBLISH_COMPLETED",
  ),
  "project.release.scheduled_publish.failed": createCatalogEntry(
    "PROJECT_RELEASE_SCHEDULED_PUBLISH_FAILED",
    "danger",
  ),

  // Project credentials / Agent approvals
  "me.api_key.created": createCatalogEntry("ME_API_KEY_CREATED"),
  "me.api_key.rotated": createCatalogEntry("ME_API_KEY_ROTATED", "warning"),
  "me.api_key.revoked": createCatalogEntry("ME_API_KEY_REVOKED", "warning"),
  "project.api_key.created": createCatalogEntry("PROJECT_API_KEY_CREATED"),
  "project.api_key.rotated": createCatalogEntry("PROJECT_API_KEY_ROTATED", "warning"),
  "project.api_key.revoked": createCatalogEntry("PROJECT_API_KEY_REVOKED", "warning"),
  "project.preview_token.created": createCatalogEntry("PROJECT_PREVIEW_TOKEN_CREATED"),
  "agent.approval.applied": createCatalogEntry("AGENT_APPROVAL_APPLIED"),

  // Content models / Items
  "content.model.created": createCatalogEntry("CONTENT_MODEL_CREATED"),
  "content.model.updated": createCatalogEntry("CONTENT_MODEL_UPDATED"),
  "content.model.deleted": createCatalogEntry("CONTENT_MODEL_DELETED", "warning"),
  "content.item.created": createCatalogEntry("CONTENT_ITEM_CREATED"),
  "content.item.updated": createCatalogEntry("CONTENT_ITEM_UPDATED"),
  "content.item.deleted": createCatalogEntry("CONTENT_ITEM_DELETED", "warning"),
  "content.item.published": createCatalogEntry("CONTENT_ITEM_PUBLISHED"),
  "content.item.unpublished": createCatalogEntry("CONTENT_ITEM_UNPUBLISHED", "warning"),
  "content.item.restored": createCatalogEntry("CONTENT_ITEM_RESTORED"),
  "project.content.item.archived": createCatalogEntry("PROJECT_CONTENT_ITEM_ARCHIVED", "warning"),
  "project.content.item.bootstrap.applied": createCatalogEntry(
    "PROJECT_CONTENT_ITEM_BOOTSTRAP_APPLIED",
  ),
  "project.content.item.duplicated": createCatalogEntry("PROJECT_CONTENT_ITEM_DUPLICATED"),
  "project.content.item.translation.created": createCatalogEntry(
    "PROJECT_CONTENT_ITEM_TRANSLATION_CREATED",
  ),
  "project.content.item.unarchived": createCatalogEntry("PROJECT_CONTENT_ITEM_UNARCHIVED"),
  "project.content.item.workflow.updated": createCatalogEntry(
    "PROJECT_CONTENT_ITEM_WORKFLOW_UPDATED",
    "warning",
  ),
  "project.content.version.archived": createCatalogEntry(
    "PROJECT_CONTENT_VERSION_ARCHIVED",
    "warning",
  ),
  "project.content.version.scheduled": createCatalogEntry("PROJECT_CONTENT_VERSION_SCHEDULED"),

  // Assets
  "asset.folder.created": createCatalogEntry("ASSET_FOLDER_CREATED"),
  "asset.folder.updated": createCatalogEntry("ASSET_FOLDER_UPDATED"),
  "asset.folder.deleted": createCatalogEntry("ASSET_FOLDER_DELETED", "warning"),
  "asset.metadata.updated": createCatalogEntry("ASSET_METADATA_UPDATED"),
  "asset.moved": createCatalogEntry("ASSET_MOVED"),
  "asset.deleted": createCatalogEntry("ASSET_DELETED", "warning"),

  // RBAC
  "rbac.role.created": {
    titleKey: "ACTIVITY_EVENT_RBAC_ROLE_CREATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_RBAC_ROLE_CREATED_DESC",
    level: "info",
  },
  "rbac.role.updated": {
    titleKey: "ACTIVITY_EVENT_RBAC_ROLE_UPDATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_RBAC_ROLE_UPDATED_DESC",
    level: "info",
  },
  "rbac.role.deleted": {
    titleKey: "ACTIVITY_EVENT_RBAC_ROLE_DELETED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_RBAC_ROLE_DELETED_DESC",
    level: "warning",
  },
  "rbac.permission.roles_set": {
    titleKey: "ACTIVITY_EVENT_RBAC_PERMISSION_ROLES_SET_TITLE",
    descriptionKey: "ACTIVITY_EVENT_RBAC_PERMISSION_ROLES_SET_DESC",
    level: "info",
  },
  "rbac.role.permissions_set": {
    titleKey: "ACTIVITY_EVENT_RBAC_ROLE_PERMISSIONS_SET_TITLE",
    descriptionKey: "ACTIVITY_EVENT_RBAC_ROLE_PERMISSIONS_SET_DESC",
    level: "info",
  },

  // System / Asset / Settings
  "system.setup.completed": {
    titleKey: "ACTIVITY_EVENT_SYSTEM_SETUP_COMPLETED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_SYSTEM_SETUP_COMPLETED_DESC",
    level: "info",
  },
  "settings.updated": {
    titleKey: "ACTIVITY_EVENT_SETTINGS_UPDATED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_SETTINGS_UPDATED_DESC",
    level: "warning",
  },
  "system.mail.updated": createCatalogEntry("SYSTEM_MAIL_UPDATED", "warning"),
  "system.storage.updated": createCatalogEntry("SYSTEM_STORAGE_UPDATED", "warning"),
  "system.settings.feature_flags.updated": createCatalogEntry(
    "SYSTEM_SETTINGS_FEATURE_FLAGS_UPDATED",
    "warning",
  ),
  "system.settings.rbac.updated": createCatalogEntry("SYSTEM_SETTINGS_RBAC_UPDATED", "warning"),
  "asset.uploaded": {
    titleKey: "ACTIVITY_EVENT_ASSET_UPLOADED_TITLE",
    descriptionKey: "ACTIVITY_EVENT_ASSET_UPLOADED_DESC",
    level: "info",
  },
};

export function listCatalogEventNames(): string[] {
  return Object.keys(ACTIVITY_EVENT_CATALOG).sort((a, b) => a.localeCompare(b));
}

export function resolveCatalogEntry(
  eventName: string | null | undefined,
): ActivityEventCatalogEntry | null {
  const key = String(eventName || "").trim();
  if (!key) return null;
  return ACTIVITY_EVENT_CATALOG[key] ?? null;
}
