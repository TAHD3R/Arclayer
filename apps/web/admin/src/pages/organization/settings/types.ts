export type OrganizationSettingsTabKey = "basics" | "danger" | "deployment";

export type OrganizationSettingsTabNavigation = {
  to:
    | "/o/$orgId/settings"
    | "/o/$orgId/settings/basics"
    | "/o/$orgId/settings/danger"
    | "/o/$orgId/settings/deployment";
  params: { orgId: string };
};
