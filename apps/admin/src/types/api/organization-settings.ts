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

export type OrganizationDangerAction = {
  enabled: boolean;
  blockedReason: string | null;
};

export type OrganizationDangerCapabilities = {
  organizationId: string;
  roleCode: string;
  confirmLeaveText: string;
  confirmDeleteName: string;
  leaveAction: OrganizationDangerAction;
  deleteAction: OrganizationDangerAction;
};

export type LeaveOrganizationResult = {
  organizationId: string;
  membershipId: string;
  left: boolean;
};

export type DeleteOrganizationResult = {
  organizationId: string;
  deleted: boolean;
};
