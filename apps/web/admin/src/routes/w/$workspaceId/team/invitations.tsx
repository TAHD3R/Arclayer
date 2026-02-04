import { createFileRoute } from "@tanstack/react-router";

import { TeamInvitationsView } from "@/pages/team/invitations/page";

export const Route = createFileRoute("/w/$workspaceId/team/invitations")({
  component: TeamInvitationsView,
});
