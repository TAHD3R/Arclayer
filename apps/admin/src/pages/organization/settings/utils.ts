import type { OrganizationSettingsTabKey, OrganizationSettingsTabNavigation } from "./types";

export function resolveOrganizationSettingsTabNavigation(
  organizationId: string,
  tab: OrganizationSettingsTabKey,
): OrganizationSettingsTabNavigation {
  if (tab === "basics") {
    return {
      to: "/o/$orgId/settings/basics",
      params: { orgId: organizationId },
    };
  }
  if (tab === "danger") {
    return {
      to: "/o/$orgId/settings/danger",
      params: { orgId: organizationId },
    };
  }
  return {
    to: "/o/$orgId/settings",
    params: { orgId: organizationId },
  };
}
