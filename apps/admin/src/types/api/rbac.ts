export type Role = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isSuperuser: boolean;
  isSystem: boolean;
};

export type Permission = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  ownerKey: string | null;
  ownerName?: string | null;
};

export type RbacMatrixPermissionRow = {
  code: string;
  name: string;
  description: string | null;
  ownerKey: string | null;
  ownerName?: string | null;
  grantedRoleCodes: string[];
};

export type RbacMatrix = {
  roles: Role[];
  permissions: RbacMatrixPermissionRow[];
};

export type WorkspacePermissionAction = {
  code: string;
  description: string | null;
  subjectKinds: string[];
  permissionCodes: string[];
};
