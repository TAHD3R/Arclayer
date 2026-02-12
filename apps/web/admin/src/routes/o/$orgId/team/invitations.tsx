import { createFileRoute } from "@tanstack/react-router";

import { OrganizationTeamInvitationsPage } from "@/pages/organization/team/invitations/page";

export const Route = createFileRoute("/o/$orgId/team/invitations")({
  component: OrganizationTeamInvitationsPage,
});
