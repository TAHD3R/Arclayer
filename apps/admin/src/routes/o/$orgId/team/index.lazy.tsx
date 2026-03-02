import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationTeamMembersPage } from "@/pages/organization/team/members/page";

export const Route = createLazyFileRoute("/o/$orgId/team/")({
  component: OrganizationTeamMembersPage,
});
