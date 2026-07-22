/**
 * Workspace permission code -> i18n key mapping for displaying user-friendly permission names
 * without fetching RBAC catalogs at runtime (which itself may require permissions).
 *
 * Keep this list aligned with backend core permission templates:
 * `apps/api/src/modules/system/rbac/catalog/service.py`
 */

const PERMISSION_NAME_I18N_KEY_BY_CODE: Record<string, string> = {
  "admin:access": "rbac:RBAC_PERM_ADMIN_ACCESS_NAME",

  "system:settings:read": "rbac:RBAC_PERM_SETTINGS_READ_NAME",
  "system:settings:manage": "rbac:RBAC_PERM_SETTINGS_MANAGE_NAME",
  "system:site:read": "rbac:RBAC_PERM_SITE_READ_NAME",
  "system:site:manage": "rbac:RBAC_PERM_SITE_MANAGE_NAME",
  "system:content:read": "rbac:RBAC_PERM_CONTENT_READ_NAME",
  "system:content:manage": "rbac:RBAC_PERM_CONTENT_MANAGE_NAME",
  "system:content:publish": "rbac:RBAC_PERM_CONTENT_PUBLISH_NAME",
  "system:assets:read": "rbac:RBAC_PERM_ASSETS_READ_NAME",
  "system:assets:manage": "rbac:RBAC_PERM_ASSETS_MANAGE_NAME",
  "system:domains:read": "rbac:RBAC_PERM_DOMAINS_READ_NAME",
  "system:domains:manage": "rbac:RBAC_PERM_DOMAINS_MANAGE_NAME",
  "system:notifications:read": "rbac:RBAC_PERM_NOTIFICATIONS_READ_NAME",
  "system:notifications:manage": "rbac:RBAC_PERM_NOTIFICATIONS_MANAGE_NAME",
  "system:jobs:read": "rbac:RBAC_PERM_JOBS_READ_NAME",

  "rbac:roles:read": "rbac:RBAC_PERM_RBAC_ROLES_READ_NAME",
  "rbac:roles:write": "rbac:RBAC_PERM_RBAC_ROLES_WRITE_NAME",
  "rbac:users:assign": "rbac:RBAC_PERM_RBAC_USERS_ASSIGN_NAME",
  "rbac:permissions:read": "rbac:RBAC_PERM_RBAC_PERMS_READ_NAME",

  "admin:users:read": "rbac:RBAC_PERM_ADMIN_USERS_READ_NAME",
  "admin:users:write": "rbac:RBAC_PERM_ADMIN_USERS_WRITE_NAME",
  "admin:users:reset-password": "rbac:RBAC_PERM_ADMIN_USERS_RESET_PW_NAME",

  "team:members:read": "rbac:RBAC_PERM_TEAM_MEMBERS_READ_NAME",
  "team:members:roles:manage": "rbac:RBAC_PERM_TEAM_MEMBER_ROLES_MANAGE_NAME",
  "team:members:manage": "rbac:RBAC_PERM_TEAM_MEMBERS_MANAGE_NAME",
  "team:members:reset-password": "rbac:RBAC_PERM_TEAM_MEMBERS_RESET_PW_NAME",
  "team:invitations:manage": "rbac:RBAC_PERM_TEAM_INVITES_MANAGE_NAME",
  "team:invite-links:manage": "rbac:RBAC_PERM_TEAM_INVITE_LINKS_MANAGE_NAME",
};

export function resolvePermissionNameI18nKey(permissionCode: string): string | null {
  const code = String(permissionCode || "").trim();
  if (!code) return null;
  return PERMISSION_NAME_I18N_KEY_BY_CODE[code] ?? null;
}
