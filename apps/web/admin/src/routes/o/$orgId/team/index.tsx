import { createFileRoute } from "@tanstack/react-router";

import { OrganizationTeamMembersPage } from "@/pages/organization/team/members/page";

export const Route = createFileRoute("/o/$orgId/team/")({
  component: OrganizationTeamMembersPage,
});
