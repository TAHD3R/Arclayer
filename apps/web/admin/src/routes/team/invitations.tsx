import { createFileRoute } from "@tanstack/react-router";

import { TeamInvitationsView } from "@/pages/team/invitations/page";

export const Route = createFileRoute("/team/invitations")({
  component: TeamInvitationsView,
});
