export type OrganizationSettingsCore = {
  organizationId: string;
  organizationName: string;
  organizationLocalization: {
    locale: string;
    timezone: string;
    dateFormat: string;
  };
  defaultRoleCode: string;
};

export type OrganizationAssignDefaultRoleResult = {
  organizationId: string;
  roleCode: string;
  updatedCount: number;
};
