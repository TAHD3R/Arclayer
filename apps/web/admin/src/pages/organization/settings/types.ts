export type OrganizationSettingsTabKey = "basics" | "danger";

export type OrganizationSettingsTabNavigation = {
  to: "/o/$orgId/settings" | "/o/$orgId/settings/basics" | "/o/$orgId/settings/danger";
  params: { orgId: string };
};
