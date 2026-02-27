import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";

import type { OrganizationAssignDefaultRoleResult, OrganizationSettingsCore } from "@/types/api";

export async function getOrganizationCoreSettings(): Promise<OrganizationSettingsCore> {
  return api.get<OrganizationSettingsCore>("/organizations/me/settings/core");
}

export async function patchOrganizationCoreSettings(patch: {
  organizationName?: string;
  organizationLocalization?: { locale?: string; timezone?: string; dateFormat?: string };
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

export async function leaveOrganization(confirmText: string): Promise<{
  organizationId: string;
  membershipId: string;
  left: boolean;
}> {
  return api.post<{ organizationId: string; membershipId: string; left: boolean }>(
    "/organizations/me/leave",
    { confirmText },
  );
}

export async function deleteOrganization(
  confirmName: string,
): Promise<{ organizationId: string; deleted: boolean }> {
  const query = toQueryString({ confirmName });
  return api.delete<{ organizationId: string; deleted: boolean }>(`/organizations/me${query}`);
}
