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
