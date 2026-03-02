import { createLazyFileRoute } from "@tanstack/react-router";

import { TeamInvitationsPage } from "@/pages/workspaces/team/invitations/page";

export const Route = createLazyFileRoute("/w/$workspaceId/team/invitations/")({
  component: TeamInvitationsPage,
});
