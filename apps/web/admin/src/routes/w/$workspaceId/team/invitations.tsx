import { createFileRoute } from "@tanstack/react-router";

import { TeamInvitationsView } from "@/views/team/TeamInvitationsView";

export const Route = createFileRoute("/w/$workspaceId/team/invitations")({
  component: TeamInvitationsView,
});
