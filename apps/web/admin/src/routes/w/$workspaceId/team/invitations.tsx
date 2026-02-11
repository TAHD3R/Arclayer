import { createFileRoute } from "@tanstack/react-router";

import { TeamInvitationsView } from "@/pages/workspaces/team/invitations/page";

export const Route = createFileRoute("/w/$workspaceId/team/invitations")({
  component: TeamInvitationsView,
});
