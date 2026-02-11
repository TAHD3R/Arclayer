import { createFileRoute } from "@tanstack/react-router";

import { OrganizationTeamRolesPage } from "@/pages/organization/team/roles/page";

export const Route = createFileRoute("/organization/team/roles")({
  component: OrganizationTeamRolesPage,
});
