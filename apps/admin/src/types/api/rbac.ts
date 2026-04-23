export type WorkspacePermissionAction = {
  code: string;
  description: string | null;
  subjectKinds: string[];
  permissionCodes: string[];
};

export type OrganizationPermissionAction = {
  code: string;
  description: string | null;
  subjectKinds: string[];
  permissionCodes: string[];
};
