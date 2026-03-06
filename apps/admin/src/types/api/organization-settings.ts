export type OrganizationSettingsCore = {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationLogoAssetAligned?: boolean;
  organizationLocalization: {
    locale: string;
    timezone: string;
    dateFormat: string;
    useBrowserTimeZone?: boolean;
    useRelativeDateTime?: boolean;
  };
  defaultRoleCode: string;
};

export type OrganizationAssignDefaultRoleResult = {
  organizationId: string;
  roleCode: string;
  updatedCount: number;
};
