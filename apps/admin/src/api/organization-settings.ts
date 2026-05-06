import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";

import type {
  DeleteOrganizationResult,
  LeaveOrganizationResult,
  OrganizationAssignDefaultRoleResult,
  OrganizationDangerCapabilities,
  OrganizationSettingsCore,
} from "@arclayer/openapi/admin-types";

export async function getOrganizationCoreSettings(): Promise<OrganizationSettingsCore> {
  return api.get<OrganizationSettingsCore>("/organizations/me/settings/core");
}

export async function patchOrganizationCoreSettings(patch: {
  organizationName?: string;
  organizationLogoUrl?: string | null;
  organizationLocalization?: {
    locale?: string;
    timezone?: string;
    dateFormat?: string;
    useBrowserTimeZone?: boolean;
    useRelativeDateTime?: boolean;
  };
  defaultRoleCode?: string;
}): Promise<OrganizationSettingsCore> {
  return api.patch<OrganizationSettingsCore>("/organizations/me/settings/core", patch);
}

export async function assignOrganizationDefaultRoleToAllUsers(input: {
  roleCode: string;
  confirmName: string;
}): Promise<OrganizationAssignDefaultRoleResult> {
  return api.post<OrganizationAssignDefaultRoleResult>(
    "/organizations/me/settings/default-role/assign-all",
    {
      roleCode: input.roleCode,
      confirmName: input.confirmName,
    },
  );
}

export async function getOrganizationDangerCapabilities(
  organizationId: string,
): Promise<OrganizationDangerCapabilities> {
  return api.get<OrganizationDangerCapabilities>(
    `/organizations/${organizationId}/settings/danger-capabilities`,
  );
}

export async function leaveOrganization(confirmText: string): Promise<LeaveOrganizationResult> {
  return api.post<LeaveOrganizationResult>("/organizations/me/leave", { confirmText });
}

export async function leaveOrganizationInScope(
  organizationId: string,
  confirmText: string,
): Promise<LeaveOrganizationResult> {
  return api.post<LeaveOrganizationResult>(`/organizations/${organizationId}/leave`, {
    confirmText,
  });
}

export async function deleteOrganization(confirmName: string): Promise<DeleteOrganizationResult> {
  const query = toQueryString({ confirmName });
  return api.delete<DeleteOrganizationResult>(`/organizations/me${query}`);
}

export async function deleteOrganizationInScope(
  organizationId: string,
  confirmName: string,
): Promise<DeleteOrganizationResult> {
  const query = toQueryString({ confirmName });
  return api.delete<DeleteOrganizationResult>(`/organizations/${organizationId}${query}`);
}
