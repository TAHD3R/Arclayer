import { createFileRoute } from "@tanstack/react-router";

import { TeamInvitationsView } from "@/pages/workspaces/team/invitations/page";

export const Route = createFileRoute("/team/invitations")({
  component: TeamInvitationsView,
});
