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
  pluginId: string | null;
  pluginName?: string | null;
};

export type RbacMatrixPermissionRow = {
  code: string;
  name: string;
  description: string | null;
  pluginId: string | null;
  pluginName?: string | null;
  grantedRoleCodes: string[];
};

export type RbacMatrix = {
  roles: Role[];
  permissions: RbacMatrixPermissionRow[];
};
