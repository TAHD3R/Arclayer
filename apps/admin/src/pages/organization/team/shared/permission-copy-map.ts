export type OrganizationPermissionCopyItem = {
  nameKey: string;
  descKey: string;
};

export const ORG_PERMISSION_COPY_MAP: Record<string, OrganizationPermissionCopyItem> = {
  "org.members.read": {
    nameKey: "ORG_ROLE_PERMISSION_MEMBERS_VIEW",
    descKey: "ORG_ROLE_PERMISSION_MEMBERS_VIEW_DESC",
  },
  "org.members.manage": {
    nameKey: "ORG_ROLE_PERMISSION_MEMBERS_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_MEMBERS_MANAGE_DESC",
  },
  "org.invitations.read": {
    nameKey: "ORG_ROLE_PERMISSION_INVITES_VIEW",
    descKey: "ORG_ROLE_PERMISSION_INVITES_VIEW_DESC",
  },
  "org.invitations.create": {
    nameKey: "ORG_ROLE_PERMISSION_INVITES_CREATE",
    descKey: "ORG_ROLE_PERMISSION_INVITES_CREATE_DESC",
  },
  "org.invitations.revoke": {
    nameKey: "ORG_ROLE_PERMISSION_INVITES_REVOKE",
    descKey: "ORG_ROLE_PERMISSION_INVITES_REVOKE_DESC",
  },
  "org.roles.read": {
    nameKey: "ORG_ROLE_PERMISSION_ROLES_VIEW",
    descKey: "ORG_ROLE_PERMISSION_ROLES_VIEW_DESC",
  },
  "org.roles.write": {
    nameKey: "ORG_ROLE_PERMISSION_ROLES_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_ROLES_MANAGE_DESC",
  },
  "org.workspaces.read": {
    nameKey: "ORG_ROLE_PERMISSION_WORKSPACES_VIEW",
    descKey: "ORG_ROLE_PERMISSION_WORKSPACES_VIEW_DESC",
  },
  "org.workspaces.manage": {
    nameKey: "ORG_ROLE_PERMISSION_WORKSPACES_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_WORKSPACES_MANAGE_DESC",
  },
  "org.workspaces.delete": {
    nameKey: "ORG_ROLE_PERMISSION_WORKSPACES_DELETE",
    descKey: "ORG_ROLE_PERMISSION_WORKSPACES_DELETE_DESC",
  },
  "org.settings.read": {
    nameKey: "ORG_ROLE_PERMISSION_SETTINGS_VIEW",
    descKey: "ORG_ROLE_PERMISSION_SETTINGS_VIEW_DESC",
  },
  "org.settings.manage": {
    nameKey: "ORG_ROLE_PERMISSION_SETTINGS_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_SETTINGS_MANAGE_DESC",
  },
  "org.settings.assign-default-role": {
    nameKey: "ORG_ROLE_PERMISSION_SETTINGS_ASSIGN_DEFAULT_ROLE",
    descKey: "ORG_ROLE_PERMISSION_SETTINGS_ASSIGN_DEFAULT_ROLE_DESC",
  },
  "org.settings.delete": {
    nameKey: "ORG_ROLE_PERMISSION_SETTINGS_DELETE",
    descKey: "ORG_ROLE_PERMISSION_SETTINGS_DELETE_DESC",
  },
  "org.extensions.read": {
    nameKey: "ORG_ROLE_PERMISSION_PLUGINS_VIEW",
    descKey: "ORG_ROLE_PERMISSION_PLUGINS_VIEW_DESC",
  },
  "org.extensions.manage": {
    nameKey: "ORG_ROLE_PERMISSION_PLUGINS_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_PLUGINS_MANAGE_DESC",
  },
  "org.activity.read": {
    nameKey: "ORG_ROLE_PERMISSION_ACTIVITY_VIEW",
    descKey: "ORG_ROLE_PERMISSION_ACTIVITY_VIEW_DESC",
  },
};
