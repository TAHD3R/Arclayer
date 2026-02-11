import { createFileRoute } from "@tanstack/react-router";

import { OrganizationTeamInvitationsPage } from "@/pages/organization/team/invitations/page";

export const Route = createFileRoute("/organization/team/invitations")({
  component: OrganizationTeamInvitationsPage,
});
