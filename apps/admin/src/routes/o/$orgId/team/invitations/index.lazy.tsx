import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationTeamInvitationsPage } from "@/pages/organization/team/invitations/page";

export const Route = createLazyFileRoute("/o/$orgId/team/invitations/")({
  component: OrganizationTeamInvitationsPage,
});
