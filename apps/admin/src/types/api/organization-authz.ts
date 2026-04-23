export type OrganizationAuthzSnapshot = {
  organizationId: string;
  userId: string;
  scope: "organization";
  roleCodes: string[];
  permissionCodes: string[];
  isSuperuser: boolean;
};
