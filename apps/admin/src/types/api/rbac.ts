export type WorkspacePermissionAction = {
  code: string;
  description: string | null;
  subjectKinds: string[];
  permissionCodes: string[];
  conditionTemplates?: string[];
};

export type OrganizationPermissionAction = {
  code: string;
  description: string | null;
  subjectKinds: string[];
  permissionCodes: string[];
};

export type PermissionConditionValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | null;

export type PermissionCondition = {
  field: string;
  operator: string;
  value?: PermissionConditionValue;
};

export type PermissionConditionSet = {
  conditions?: PermissionCondition[];
};

export type RolePermissionGrant = {
  permissionCode: string;
  conditionSets: PermissionConditionSet[];
};
