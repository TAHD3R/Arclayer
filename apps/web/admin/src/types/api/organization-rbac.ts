export type OrganizationRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isBuiltin: boolean;
};

export type OrganizationPermission = {
  id: string;
  code: string;
  module: string;
  name: string;
  description: string | null;
};

export type OrganizationRbacMatrixPermissionRow = {
  code: string;
  module: string;
  name: string;
  description: string | null;
  grantedRoleCodes: string[];
};

export type OrganizationRbacMatrix = {
  roles: OrganizationRole[];
  permissions: OrganizationRbacMatrixPermissionRow[];
};
