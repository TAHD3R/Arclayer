import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationTeamRolesPage } from "@/pages/organization/team/roles/page";

export const Route = createLazyFileRoute("/o/$orgId/team/roles/")({
  component: OrganizationTeamRolesPage,
});
