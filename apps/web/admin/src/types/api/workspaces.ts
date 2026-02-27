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
