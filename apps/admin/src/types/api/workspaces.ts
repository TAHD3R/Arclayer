export type MyWorkspace = {
  workspaceId: string;
  organizationId: string;
  slug: string;
  name: string;
  visibleOnly: boolean;
  isCreatorAdmin: boolean;
};

export type MyWorkspaceListResult = {
  items: MyWorkspace[];
};

export type AuthzSnapshot = {
  userId: string;
  roleCodes: string[];
  permissionCodes: string[];
  isSuperuser: boolean;
};

export type WorkspaceDetail = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  iconAssetAligned?: boolean;
};

export type WorkspaceRolePolicy = {
  workspaceId: string;
  defaultRoleCode: string;
};

export type WorkspaceAssignRoleResult = {
  workspaceId: string;
  roleCode: string;
  updatedCount: number;
};

export type LeaveWorkspaceResult = {
  workspaceId: string;
  membershipId: string;
  left: boolean;
};

export type WorkspaceDeleteResult = {
  workspaceId: string;
  deleted: boolean;
};

export type WorkspaceDangerAction = {
  enabled: boolean;
  blockedReason: string | null;
};

export type WorkspaceDangerCapabilities = {
  workspaceId: string;
  organizationId: string;
  confirmLeaveText: string;
  confirmDeleteName: string;
  leaveAction: WorkspaceDangerAction;
  deleteAction: WorkspaceDangerAction;
};
